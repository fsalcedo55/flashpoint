import assert from "node:assert/strict";
import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { evaluateCase } from "../evals/evaluate-case";
import { classificationFixture } from "./analysis-fixtures";

const sources = ["one", "two"].map((id) => ({ sourceId: id, documentId: id, document: `${id}.docx`,
  location: "Paragraph 1", text: "Q1. How satisfied are you? Very dissatisfied / Dissatisfied / Neutral / Satisfied / Very satisfied." }));
const testCase = { id: "classification", description: "Classification integrity", files: [], expectEmpty: true, criteria: [], patterns: [] };
const response = (output: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(output) }],
  finishReason: { unified: "stop" as const, raw: undefined }, warnings: [],
  usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 100, text: 100, reasoning: undefined } } });
const loadSources = async () => ({ sources, sourceHash: "test" });

test("incomplete, duplicate and unsupported classifications are quality failures, even for abstention cases", async () => {
  const classifications = classificationFixture(sources);
  for (const invalid of [classifications.slice(0, 1), [classifications[0], classifications[0]],
    [classifications[0], { ...classifications[1], evidence: [{ sourceId: "two", quote: "Invented evidence" }] }]]) {
    const model = new MockLanguageModelV4({ doGenerate: response({ classifications: invalid, suggestions: [] }) });
    const judge = new MockLanguageModelV4();
    const result = await evaluateCase(testCase, 1, { model, judge, reasoning: "medium", loadSources });
    assert.equal(result.status, "quality-failure");
    assert.equal(result.error, undefined);
    assert.equal(result.checks.find((check) => check.name === "Document classifications")?.passed, false);
    assert.deepEqual(result.raw?.classifications, invalid);
    assert.equal(result.usage?.generationInput, 100);
    assert.equal(judge.doGenerateCalls.length, 0);
  }
});

test("valid classifications can pass abstention without being mistaken for a verifier failure", async () => {
  const model = new MockLanguageModelV4({ doGenerate: response({ classifications: classificationFixture(sources), suggestions: [] }) });
  const judge = new MockLanguageModelV4({ doGenerate: response({ suggestions: [], criteria: [], patterns: [] }) });
  const result = await evaluateCase(testCase, 1, { model, judge, reasoning: "medium", loadSources });
  assert.equal(result.status, "passed");
  assert.equal(judge.doGenerateCalls.length, 1);
});

test("fixture, provider and grading failures remain operational and do not expose raw errors", async () => {
  const model = new MockLanguageModelV4({ doGenerate: response({ classifications: classificationFixture(sources), suggestions: [] }) });
  const failure = async (): Promise<never> => { throw new Error("Private request data must not be reported."); };
  const failedModel = new MockLanguageModelV4({ doGenerate: failure });
  for (const [options, stage] of [
    [{ model, judge: model, loadSources: failure }, "fixture extraction"],
    [{ model: failedModel, judge: model, loadSources }, "generation"],
    [{ model, judge: failedModel, loadSources }, "semantic grading"],
  ] as const) {
    const result = await evaluateCase(testCase, 1, { ...options, reasoning: "medium" });
    assert.equal(result.status, "error");
    assert.ok(result.error?.startsWith(`${stage} failed`));
    assert.ok(!JSON.stringify(result).includes("Private request data"));
  }
});
