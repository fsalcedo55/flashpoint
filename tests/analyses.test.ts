import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { APICallError, createGateway } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { TRPCError } from "@trpc/server";
import { analyzeDocuments } from "../src/server/analyses";
import { extractionSchema, generatePreferences, verifyEvidence, type SourcePassage } from "../src/server/preference-extraction";
import { appRouter } from "../src/server/router";


const openingQuote = "1. Which brands come to mind?\n2. Which of these brands do you recognize?";
const scaleQuote = "Very dissatisfied / Dissatisfied / Neutral / Satisfied / Very satisfied";
const candidate = (sourceId: string, quote = openingQuote, rule = "Begin brand awareness sections with an open-ended question before listing brands.") => ({
  category: "Question order", title: "Ask unaided questions first", rule,
  rationale: "This questionnaire asks for unprompted recall first. This may be specific to this document and needs confirmation.",
  evidence: [{ sourceId, quote }],
});
function response(output: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 200, text: 200, reasoning: undefined } },
    warnings: [],
  };
}
function fixtureModel(output: unknown) { return new MockLanguageModelV4({ doGenerate: response(output) }); }

test("evidence validation rejects invented references and preserves original quote formatting", () => {
  const source: SourcePassage = { sourceId: "d1s1", documentId: randomUUID(), document: "Survey.pdf", location: "Page 1", text: openingQuote };
  const output = extractionSchema.parse({ suggestions: [candidate("d1s1", openingQuote.replace("\n", " ")), candidate("invented"), candidate("d1s1", "A quote that never appeared anywhere.")] });
  const verified = verifyEvidence(output, [source]);
  assert.equal(verified.suggestions.length, 1);
  assert.equal(verified.rejectedCount, 2);
  assert.equal(verified.suggestions[0].evidence[0].quote, openingQuote);
  assert.equal(verified.suggestions[0].evidence[0].location, "Page 1");
});

test("the Gateway adapter sends authenticated structured requests and forwards provider options", async () => {
  let calls = 0;
  const provider = createGateway({ apiKey: "test-only-key", fetch: async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://ai-gateway.vercel.sh/v4/ai/language-model");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-only-key");
    assert.equal(headers.get("ai-language-model-id"), "openai/gpt-5.4-mini");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.providerOptions.openai.store, false);
    assert.equal(body.responseFormat.type, "json");
    assert.ok(body.responseFormat.schema.properties.suggestions);
    assert.equal(body.maxOutputTokens, 10_000);
    assert.equal(body.reasoning, "medium");
    assert.ok(!body.tools?.length);
    return new Response(JSON.stringify(response({ suggestions: [candidate("d1s1")] })), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  const result = await generatePreferences(provider("openai/gpt-5.4-mini"), [{ sourceId: "d1s1", documentId: randomUUID(), document: "Survey.pdf", location: "Page 1", text: openingQuote }]);
  assert.equal(result.output.suggestions.length, 1);
  assert.equal(result.inputTokens, 100);
  assert.equal(calls, 1);
});

test("evaluation can lower reasoning without changing subsequent app requests", async () => {
  const efforts: unknown[] = [];
  const model = new MockLanguageModelV4({ doGenerate: async (options) => {
    efforts.push(options.reasoning);
    return response({ suggestions: [] });
  } });
  const sources: SourcePassage[] = [{ sourceId: "d1s1", documentId: randomUUID(), document: "Survey.pdf", location: "Page 1", text: openingQuote }];
  await generatePreferences(model, sources, "low");
  await generatePreferences(model, sources);
  assert.deepEqual(efforts, ["low", "medium"]);
});

const input = () => ({ documents: [{ id: randomUUID(), name: "Survey.docx", sections: [
  { location: "Paragraph 1", text: openingQuote }, { location: "Paragraph 2", text: scaleQuote },
] }] });

test("stateless analysis returns only pending suggestions with verified source names and quotes", async () => {
  const source = input();
  const result = await analyzeDocuments(source, { model: fixtureModel({ suggestions: [candidate("d1s1"), candidate("invented")] }) });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.rejectedCount, 1);
  assert.equal(result.suggestions[0].status, "pending");
  assert.equal(result.suggestions[0].evidence[0].documentId, source.documents[0].id);
  assert.equal(result.suggestions[0].evidence[0].document, "Survey.docx");
  assert.equal(result.suggestions[0].suggestedRule, result.suggestions[0].rule);
});

test("requests from separate sessions never reuse or expose another request's results", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => { calls++; return response({ suggestions: [candidate("d1s1")] }); } });
  const a = input(); const b = input();
  const [first, second] = await Promise.all([analyzeDocuments(a, { model }), analyzeDocuments(b, { model })]);
  assert.equal(calls, 2);
  assert.notEqual(first.suggestions[0].id, second.suggestions[0].id);
  assert.equal(first.suggestions[0].evidence[0].documentId, a.documents[0].id);
  assert.equal(second.suggestions[0].evidence[0].documentId, b.documents[0].id);
});

test("empty, duplicate, oversized and unreadable selections are rejected before calling AI", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => { calls++; return response({ suggestions: [] }); } });
  const source = input();
  const cases = [
    { documents: [] }, { documents: Array.from({ length: 6 }, () => input().documents[0]) },
    { documents: [...source.documents, ...source.documents] },
    { documents: [{ ...source.documents[0], sections: [{ location: "Page 1", text: " " }] }] },
    { documents: [{ ...source.documents[0], sections: [{ location: "Page 1", text: "x".repeat(80_000) }] }] },
  ];
  for (const value of cases) await assert.rejects(analyzeDocuments(value, { model }), TRPCError);
  assert.equal(calls, 0);
});

test("unverifiable and malformed output fail; an empty suggestion list is valid", async () => {
  await assert.rejects(analyzeDocuments(input(), { model: fixtureModel({ suggestions: [candidate("nonexistent")] }) }), /verifiable/);
  await assert.rejects(analyzeDocuments(input(), { model: fixtureModel({ broken: true }) }), /expected format/);
  assert.deepEqual(await analyzeDocuments(input(), { model: fixtureModel({ suggestions: [] }) }), { suggestions: [], rejectedCount: 0 });
});

test("provider errors are sanitized and a failed request can be retried", async () => {
  const model = new MockLanguageModelV4({ doGenerate: async () => { throw new APICallError({ message: "private provider details", url: "https://example.test", requestBodyValues: {}, statusCode: 429 }); } });
  await assert.rejects(analyzeDocuments(input(), { model }), (error: Error) => /rate limit/.test(error.message) && !error.message.includes("private provider"));
  assert.equal((await analyzeDocuments(input(), { model: fixtureModel({ suggestions: [candidate("d1s1")] }) })).suggestions.length, 1);
});

test("tRPC validates requests and reports missing credentials without a database", async () => {
  const original = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  try {
    const caller = appRouter.createCaller({});
    assert.equal((await caller.analyses.configuration()).configured, false);
    await assert.rejects(caller.analyses.start({ documents: [] }), (error: TRPCError) => error.code === "BAD_REQUEST");
    await assert.rejects(caller.analyses.start(input()), (error: TRPCError) => error.code === "PRECONDITION_FAILED");
  } finally {
    if (original === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = original;
  }
});
