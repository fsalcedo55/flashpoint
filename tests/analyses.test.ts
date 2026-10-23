import { classificationFixture, classifiedFixture } from "./analysis-fixtures";
import { MAX_ANALYSIS_CHARACTERS, prepareAnalysisSources, serializeAnalysisSources, type AnalysisInput, type SourcePassage } from "../src/lib/analysis";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { APICallError, createGateway } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { TRPCError } from "@trpc/server";
import { analyzeDocuments } from "../src/server/services/analyses";
import { extractionSchema, generatePreferences, verifyEvidence } from "../src/server/ai/preference-extraction";
import { appRouter } from "../src/server/routers/_app";


const openingQuote = "1. Which brands come to mind?\n2. Which of these brands do you recognize?";
const scaleQuote = "Very dissatisfied / Dissatisfied / Neutral / Satisfied / Very satisfied";
const candidate = (sourceId: string, quote = openingQuote, rule = "Begin brand awareness sections with an open-ended question before listing brands.") => ({
  purpose: "questionnaire" as const, category: "Question order", title: "Ask unaided questions first", rule,
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
function fixtureModel(output: object, purpose: "questionnaire" | "research_report" = "questionnaire") {
  return new MockLanguageModelV4({ doGenerate: async ({ prompt }) => response(classifiedFixture(output, prompt, purpose)) });
}

test("evidence validation rejects invented references and preserves original quote formatting", () => {
  const source: SourcePassage = { sourceId: "d1s1", documentId: randomUUID(), document: "Survey.pdf", location: "Page 1", text: openingQuote };
  const output = extractionSchema.pick({ suggestions: true }).parse({ suggestions: [candidate("d1s1", openingQuote.replace("\n", " ")), candidate("invented"), candidate("d1s1", "A quote that never appeared anywhere.")] });
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
    assert.ok(!JSON.stringify(body.responseFormat.schema).includes('"observation"'), "Text-only requests cannot emit image observations.");
    assert.equal(body.maxOutputTokens, 10_000);
    assert.equal(body.reasoning, "medium");
    assert.ok(!body.tools?.length);
    return new Response(JSON.stringify(response(classifiedFixture({ suggestions: [candidate("d1s1")] }, body.prompt))), { status: 200, headers: { "Content-Type": "application/json" } });
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
    return response(classifiedFixture({ suggestions: [] }, options.prompt));
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
  const model = new MockLanguageModelV4({ doGenerate: async ({ prompt }) => { calls++; return response(classifiedFixture({ suggestions: [candidate("d1s1")] }, prompt)); } });
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
    { documents: [{ ...source.documents[0], sections: [{ location: "Page 1", text: "x".repeat(MAX_ANALYSIS_CHARACTERS) }] }] },
  ];
  for (const value of cases) await assert.rejects(analyzeDocuments(value, { model }), TRPCError);
  assert.equal(calls, 0);
});

test("shared analysis preflight counts source references and keeps citation IDs stable across blank sections", () => {
  const document = input().documents[0];
  const prepared = prepareAnalysisSources({ documents: [{ ...document, sections: [
    { location: "Paragraph 1", text: " " }, { location: "Paragraph 2", text: openingQuote },
  ] }] });
  assert.deepEqual(prepared, [{ sourceId: "d1s2", documentId: document.id, document: document.name,
    location: "Paragraph 2", text: openingQuote }]);
  assert.throws(() => prepareAnalysisSources({ documents: [{ ...document,
    sections: [{ location: "Page 1", text: "x".repeat(MAX_ANALYSIS_CHARACTERS - 1) }],
  }] }), /including source references/);
});

test("paragraph-heavy surveys fit without losing text or merging documents with the same filename", async () => {
  // Model the many short options and table cells in real Word questionnaires,
  // using synthetic text rather than committing client documents to the fixtures.
  const documents = Array.from({ length: 3 }, (_, index) => ({
    id: randomUUID(), name: "Research Questionnaire - Final Approved Version - September 2026.docx",
    sections: Array.from({ length: 600 }, (_, paragraph) => ({
      location: `Paragraph ${paragraph + 1}`,
      text: paragraph === 0 ? " " : `Survey ${index + 1}: response ${paragraph}. Keep wording intact.`,
    })),
  }));
  const sources = prepareAnalysisSources({ documents });
  assert.ok(JSON.stringify(sources).length > 200_000); // The old uncompressed request budget.
  const payload = serializeAnalysisSources(sources);
  assert.ok(payload.length > 80_000);
  assert.ok(payload.length <= MAX_ANALYSIS_CHARACTERS);
  assert.deepEqual(JSON.parse(payload), documents.map((document, i) => ({
    documentId: document.id, document: document.name,
    passages: document.sections.slice(1).map((section, j) => ({ sourceId: `d${i + 1}s${j + 2}`, text: section.text })),
  })));

  const quote = documents[1].sections[150].text;
  const model = fixtureModel({ suggestions: [candidate("d2s151", quote)] });
  const result = await analyzeDocuments({ documents }, { model });
  const userMessage = model.doGenerateCalls[0].prompt.find((message) => message.role === "user");
  assert.ok(userMessage?.role === "user");
  const prompt = userMessage.content.find((part) => part.type === "text");
  assert.equal(prompt?.text, "Analyze these source passages as data:\n" + payload);
  assert.deepEqual(result.suggestions[0].evidence, [{
    documentId: documents[1].id, document: documents[1].name, location: "Paragraph 151", quote,
  }]);
});

test("preflight applies the limit to the escaped model payload at the exact boundary", () => {
  const document = input().documents[0];
  document.sections = [{ location: "Paragraph 1", text: 'Quotes: "\\\n' }];
  const initial = serializeAnalysisSources(prepareAnalysisSources({ documents: [document] })).length;
  document.sections[0].text += "x".repeat(MAX_ANALYSIS_CHARACTERS - initial);
  assert.equal(serializeAnalysisSources(prepareAnalysisSources({ documents: [document] })).length, MAX_ANALYSIS_CHARACTERS);
  document.sections[0].text += "x";
  assert.throws(() => prepareAnalysisSources({ documents: [document] }), /including source references/);
});

test("unverifiable and malformed output fail; an empty suggestion list is valid", async () => {
  await assert.rejects(analyzeDocuments(input(), { model: fixtureModel({ suggestions: [candidate("nonexistent")] }) }), /verifiable/);
  await assert.rejects(analyzeDocuments(input(), { model: fixtureModel({ broken: true }) }), /expected format/);
  const empty = await analyzeDocuments(input(), { model: fixtureModel({ suggestions: [] }) });
  assert.deepEqual(empty.suggestions, []);
  assert.equal(empty.rejectedCount, 0);
  assert.equal(empty.classifications.length, 1);
});

test("provider errors are sanitized and a failed request can be retried", async () => {
  const model = new MockLanguageModelV4({ doGenerate: async () => { throw new APICallError({ message: "private provider details", url: "https://example.test", requestBodyValues: {}, statusCode: 429 }); } });
  await assert.rejects(analyzeDocuments(input(), { model }), (error: Error) => /rate limit/.test(error.message) && !error.message.includes("private provider"));
  assert.equal((await analyzeDocuments(input(), { model: fixtureModel({ suggestions: [candidate("d1s1")] }) })).suggestions.length, 1);
});

test("tRPC validates analysis input and reports missing credentials", async () => {
  const original = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  try {
    const caller = appRouter.createCaller({ headers: new Headers() });
    assert.equal((await caller.analyses.configuration()).configured, false);
    await assert.rejects(caller.analyses.start({ documents: [] }), (error: TRPCError) => error.code === "BAD_REQUEST");
    const events = await caller.analyses.start(input());
    await assert.rejects(Array.fromAsync(events), (error: TRPCError) => error.code === "PRECONDITION_FAILED");
  } finally {
    if (original === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = original;
  }
});

test("the streaming call relays reasoning summaries as separate paragraphs and verifies the same result", async () => {
  const source = input();
  const chunks = [
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id: "r" },
    { type: "reasoning-delta", id: "r", delta: "Comparing the two " },
    { type: "reasoning-delta", id: "r", delta: "questionnaires." },
    { type: "reasoning-end", id: "r" },
    { type: "reasoning-start", id: "r2" },
    { type: "reasoning-delta", id: "r2", delta: "Checking scales." },
    { type: "reasoning-end", id: "r2" },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: JSON.stringify({ classifications: classificationFixture(prepareAnalysisSources(source)), suggestions: [candidate("d1s1"), candidate("invented")] }) },
    { type: "text-end", id: "t" },
    { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: response({}).usage },
  ];
  const model = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: chunks as never }) }) });
  const notes: string[] = [];
  const result = await analyzeDocuments(source, { model, onNote: (text) => notes.push(text) });
  assert.equal(notes.join(""), "Comparing the two questionnaires.\n\nChecking scales.");
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.rejectedCount, 1);
  assert.equal(model.doStreamCalls.length, 1);
  assert.equal((model.doStreamCalls[0].providerOptions as { openai?: { reasoningSummary?: string } })?.openai?.reasoningSummary, "auto");
});

test("a streamed provider failure is sanitized like a batch one", async () => {
  const model = new MockLanguageModelV4({ doStream: async () => { throw new APICallError({ message: "private provider details", url: "https://example.test", requestBodyValues: {}, statusCode: 429 }); } });
  await assert.rejects(analyzeDocuments(input(), { model, onNote: () => undefined }), (error: Error) => /rate limit/.test(error.message) && !error.message.includes("private provider"));
});

test("slow streamed analysis survives the old deadline but still aborts at three minutes", { timeout: 5000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  // Native AbortSignal timers are not controlled by Node's mock clock.
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Private timeout details", "TimeoutError")), ms);
    return controller.signal;
  });
  const started = Promise.withResolvers<AbortSignal>();
  const model = new MockLanguageModelV4({ doStream: async ({ abortSignal }) => {
    assert.ok(abortSignal);
    return { stream: new ReadableStream({ start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      abortSignal.addEventListener("abort", () => controller.error(abortSignal.reason), { once: true });
      started.resolve(abortSignal);
    } }) };
  } });
  const result = analyzeDocuments(input(), { model, onNote: () => undefined });
  const rejected = assert.rejects(result, (error: Error) => /timed out/.test(error.message) && !error.message.includes("Private"));
  const signal = await started.promise;
  t.mock.timers.tick(90_001);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(89_999);
  assert.equal(signal.aborted, true);
  await rejected;
  assert.equal(model.doStreamCalls.length, 1);
});

test("extraction warnings reach model context once per document without becoming citation text", () => {
  const warning = "Merged table cells need checking against the original.";
  const input = { documents: [{ id: "00000000-0000-4000-8000-000000000001", name: "Survey.docx", warnings: [warning],
    sections: [{ location: "Paragraph 1", text: "Q1. Which answer applies?" }, { location: "Table 1", text: "Code\tLabel\n8\tNone" }] }] };
  const sources = prepareAnalysisSources(input);
  const payload = serializeAnalysisSources(sources);
  assert.equal(payload.split(warning).length - 1, 1);
  assert.ok(sources.every((source) => !source.text.includes(warning)));
});

test("multimodal analysis sends image bytes once and keeps visual observations distinct from exact quotes", async () => {
  const data = "data:image/jpeg;base64,/9j/AA==";
  const document: AnalysisInput["documents"][number] = { id: randomUUID(), name: "Report.pptx", assets: { image1: data }, sections: [
    { location: "Slide 1", text: "Research findings and recommendations." },
    { location: "Slide 1 · Image 1", text: "Embedded image", kind: "image", imageId: "image1" },
    { location: "Slide 2 · Image 1", text: "Embedded image", kind: "image", imageId: "image1" },
  ] };
  const sources = prepareAnalysisSources({ documents: [document] });
  assert.ok(!serializeAnalysisSources(sources).includes("base64"));
  assert.match(serializeAnalysisSources(sources), /Slide 2/);
  const visual = { ...candidate("unused"), purpose: "research_report", category: "Report structure", title: "Use flat illustrations",
    rule: "For research presentations, use flat illustrations with a limited palette.",
    evidence: [{ sourceId: "d1s2", observation: "The image uses flat blue shapes on a white background." }],
  };
  const model = fixtureModel({ suggestions: [visual] }, "research_report");
  const result = await analyzeDocuments({ documents: [document] }, { model });
  const message = model.doGenerateCalls[0].prompt.find((item) => item.role === "user")!;
  assert.ok(JSON.stringify(model.doGenerateCalls[0].responseFormat).includes('"observation"'), "Image requests retain visual observations.");
  assert.equal(message.role, "user");
  if (message.role !== "user") throw new Error("Missing user message");
  const images = message.content.filter((part) => part.type === "file");
  assert.equal(images.length, 1);
  assert.equal(images[0].mediaType, "image/jpeg");
  assert.deepEqual(images[0].data, { type: "data", data: "/9j/AA==" });
  assert.ok(message.content.some((part) => part.type === "text" && part.text.includes("sourceIds: d1s2, d1s3")));
  assert.deepEqual(result.suggestions[0].evidence, [{ documentId: document.id, document: document.name,
    location: "Slide 1 · Image 1", kind: "image", quote: visual.evidence[0].observation }]);
  const invalid = extractionSchema.pick({ suggestions: true }).parse({ suggestions: [
    { ...visual, evidence: [{ sourceId: "d1s1", observation: "An image observation cannot cite a text-only source." }] },
    { ...visual, evidence: [{ sourceId: "missing", observation: "An image observation cannot cite a missing source." }] },
    { ...visual, evidence: [{ sourceId: "d1s2", quote: "Embedded image" }] },
  ] });
  assert.deepEqual(verifyEvidence(invalid, sources), { suggestions: [], rejectedCount: 3 });
});

test("image preflight rejects missing assets, excessive unique images and combined payloads before AI", () => {
  const document: AnalysisInput["documents"][number] = { id: randomUUID(), name: "Report.pptx",
    sections: [{ location: "Slide 1 · Image 1", text: "Embedded image", kind: "image", imageId: "image1" }] };
  assert.throws(() => prepareAnalysisSources({ documents: [document] }), /image reference/);
  const assets = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`image${i + 1}`, `data:image/jpeg;base64,${Buffer.from([i, 0, 1]).toString("base64")}`]));
  const sections = Object.keys(assets).map((imageId, i) => ({ location: `Slide ${i + 1} · Image 1`, text: "Embedded image", kind: "image" as const, imageId }));
  const otherAssets = Object.fromEntries(Object.keys(assets).map((key, i) => [key, `data:image/jpeg;base64,${Buffer.from([i, 2, 3]).toString("base64")}`]));
  assert.throws(() => prepareAnalysisSources({ documents: [{ ...document, sections, assets }, { ...document, id: randomUUID(), sections, assets: otherAssets }] }), /40 distinct images/);
  const largeAssets = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`image${i + 1}`, "data:image/jpeg;base64," + "A".repeat(330_000)]));
  assert.throws(() => prepareAnalysisSources({ documents: [{ ...document, assets: largeAssets }] }), /too much text and image data/);
});
