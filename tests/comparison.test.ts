import assert from "node:assert/strict";
import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import type { SourcePassage } from "../src/lib/analysis";
import { serializeAnalysisSources } from "../src/lib/analysis";
import { chunks, costEstimate, discover, newCache, reconcile, retrieve, withNeighbors, type Discovery } from "../evals/comparison/strategies";
import { fictionalCases, longQuestionnaire, validateSources } from "../evals/comparison/cases";
import { runStrategies, type Strategy } from "../evals/comparison/execution";

const source = (n: number, doc = "one"): SourcePassage => ({ sourceId: `${doc}-${n}`, documentId: doc, document: `${doc}.docx`, location: `Paragraph ${n}`, text: `Question ${n}: give a fully labeled opinion rating.` });
const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 15, reasoning: 5 } };
const response = (output: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(output) }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });

test("comparison chunking preserves every passage, order and document boundaries", () => {
  const sources = [source(1), source(2), source(3, "two")];
  const limit = serializeAnalysisSources([sources[0]]).length + 1;
  const split = chunks(sources, limit);
  assert.deepEqual(split.flat(), sources);
  assert.ok(split.every((part) => serializeAnalysisSources(part).length <= limit));
  assert.equal(chunks(sources, 1000).length, 2);
  assert.throws(() => chunks(sources, 10), /exceeds/);
});

test("retrieval includes a competing document even when near duplicates dominate top-k", () => {
  const blocks = [[source(1)], [source(2)], [source(3)], [source(4)], [source(1, "exception")]];
  const result = retrieve(blocks, [[1, 0], [1, 0.01], [1, 0.02], [1, 0.03], [0, 1]], [[1, 0]]);
  assert.ok(result.has("exception-1"));
  assert.equal(result.size, 4);
  assert.throws(() => retrieve(blocks, [], [[1, 0]]), /mismatch/);
});

test("neighbor expansion preserves original order, deduplicates and stays within a document", () => {
  const sources = [source(1), source(2), source(3), source(1, "two")];
  assert.deepEqual(withNeighbors(sources, new Set(["one-2", "one-3"])), sources.slice(0, 3));
  assert.deepEqual(withNeighbors(sources, new Set(["two-1"])), [sources[3]]);
});

test("adding a document reuses unchanged analyses; changing text invalidates its cache", async () => {
  const model = new MockLanguageModelV4({ doGenerate: response({ suggestions: [], exceptions: [] }) });
  const cache = newCache();
  const initial = [source(1), source(1, "two")];
  assert.equal((await discover(model, initial, cache)).usage.length, 2);
  const fourth = await discover(model, [...initial, source(1, "three")], cache);
  assert.equal(fourth.reused, 2);
  assert.equal(fourth.usage.length, 1);
  const changed = await discover(model, [{ ...initial[0], text: "Different wording invalidates the previous analysis." }, initial[1]], cache);
  assert.equal(changed.reused, 1);
  assert.equal(changed.usage.length, 1);
});

test("reconciliation cannot cite an original passage that was not in its supplied context", async () => {
  const sources = [source(1), source(2)];
  const output = { suggestions: [{ title: "Label opinion scales", rule: "Use fully labeled opinion ratings.", rationale: "This passage is evidence from one questionnaire only.", category: "Answer formats",
    evidence: [{ sourceId: sources[1].sourceId, quote: sources[1].text }] }] };
  const model = new MockLanguageModelV4({ doGenerate: response(output) });
  const discovery: Discovery = { mapped: [], context: [sources[0]], usage: [], reused: 0, ms: 0 };
  const result = await reconcile(model, sources, discovery.context, discovery);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.suggestions.length, 0);
});

test("discovery rejects blank, invented and unknown-source exception citations", async () => {
  const passage = source(1);
  const model = new MockLanguageModelV4({ doGenerate: response({ suggestions: [], exceptions: [
    { sourceId: passage.sourceId, quote: passage.text },
    { sourceId: passage.sourceId, quote: "            " },
    { sourceId: passage.sourceId, quote: "This quotation is invented." },
    { sourceId: "unknown", quote: passage.text },
  ] }) });
  const result = await discover(model, [passage], newCache());
  assert.equal(result.mapped[0].rejected, 3);
  assert.deepEqual(result.mapped[0].data.exceptions, [{ sourceId: passage.sourceId, quote: passage.text }]);
});

test("cost estimates include discovery and embeddings without double-counting reasoning", () => {
  const calls = [{ label: "generation", ms: 10, input: 1_000_000, output: 1_000_000, embedding: 0 },
    { label: "index", ms: 10, input: 0, output: 0, embedding: 1_000_000 }];
  assert.equal(costEstimate(calls, "openai/gpt-6-luna", "openai/text-embedding-3-small"), 0.62);
  assert.equal(costEstimate(calls, "different-model", "openai/text-embedding-3-small"), null);
  assert.equal(costEstimate([{ ...calls[0], input: null }], "openai/gpt-6-luna", "openai/text-embedding-3-small"), null);
});

test("controlled load preserves all 600 paragraphs after grouping and initial IDs for incremental reuse", async () => {
  const [initial, added, long] = await fictionalCases();
  assert.deepEqual(added.sources.slice(0, initial.sources.length), initial.sources);
  assert.equal(long.sources.slice(initial.sources.length).map((s) => s.text).join("\n"), longQuestionnaire().join("\n"));
  assert.ok(serializeAnalysisSources(long.sources).length > 80_000);
  for (const item of [initial, added, long]) assert.doesNotThrow(() => validateSources(item.sources));
  assert.throws(() => validateSources([source(1), source(1)]), /duplicate/);
});

test("strategy failures do not skip independent comparisons in either run order", async () => {
  for (const repetition of [1, 2]) for (const failure of ["full", "per-document", "retrieval", "discovery", undefined]) {
    const calls: string[] = [], errors: Strategy[] = [];
    const run = async (strategy: string) => { calls.push(strategy); if (strategy === failure) throw new Error("provider failure"); };
    const discovery = { context: [source(1)] };
    await runStrategies(repetition, {
      full: () => run("full"),
      discover: async () => { await run("discovery"); return discovery; },
      perDocument: async (input) => { assert.equal(input, discovery); await run("per-document"); },
      retrieval: async (input) => { assert.equal(input, discovery); await run("retrieval"); },
      onError: async (strategy) => { errors.push(strategy); },
    });
    const order = repetition === 1 ? ["full", "discovery", "per-document", "retrieval"] : ["discovery", "retrieval", "per-document", "full"];
    assert.deepEqual(calls, failure === "discovery" ? order.filter((item) => item === "full" || item === "discovery") : order);
    assert.deepEqual(errors, failure === "discovery" ? ["per-document", "retrieval"] : failure ? [failure] : []);
  }
});

test("text-only architecture prototypes reject image cases instead of silently dropping pixels", () => {
  assert.throws(() => validateSources([{ ...source(1), kind: "image", imageDataUrl: "data:image/jpeg;base64,AA==" }]), /Use eval:ai/);
});
