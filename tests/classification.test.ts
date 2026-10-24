import assert from "node:assert/strict";
import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { prepareAnalysisSources } from "../src/lib/analysis";
import { classificationFixture } from "./analysis-fixtures";
import { verifyClassifications } from "../src/server/ai/document-classification";
import { extractionSchema, verifyAnalysis } from "../src/server/ai/preference-extraction";
import { analyzeDocuments } from "../src/server/services/analyses";
import { classificationCases } from "../evals/classification-cases";
import { loadCase } from "../evals/fixtures";
import { deterministicChecks } from "../evals/grading";

const input = { documents: [
  { id: "00000000-0000-4000-8000-000000000001", name: "Same name.docx", sections: [{ location: "Paragraph 1", text: "Q1. How satisfied are you? Very dissatisfied / Dissatisfied / Neither / Satisfied / Very satisfied." }] },
  { id: "00000000-0000-4000-8000-000000000002", name: "Same name.docx", sections: [{ location: "Paragraph 1", text: "Proposed research scope: interviews are optional and require written authorization; their summary is excluded from the baseline deliverable." }] },
] };
const sources = prepareAnalysisSources(input);
const classifications = [classificationFixture([sources[0]])[0], classificationFixture([sources[1]], "research_plan")[0]];
const survey = {
  purpose: "questionnaire" as const, category: "Answer formats" as const, title: "Label each scale point",
  rule: "In five-point satisfaction questions, label each point.", rationale: "This is a tentative observation from a single questionnaire.",
  evidence: [{ sourceId: "d1s1", quote: sources[0].text }],
};
const plan = {
  ...survey, purpose: "research_plan" as const, category: "Scope & deliverables" as const, title: "Separate optional deliverables",
  rule: "In research plans, explicitly exclude optional interview deliverables from the baseline and tie them to written authorization.",
  evidence: [{ sourceId: "d2s1", quote: sources[1].text }],
};

test("classification identity uses document IDs even when filenames match", () => {
  const result = verifyAnalysis(extractionSchema.parse({ classifications, suggestions: [survey, plan] }), sources);
  assert.deepEqual(result.classifications.map((item) => [item.documentId, item.purpose]), [
    [input.documents[0].id, "questionnaire"], [input.documents[1].id, "research_plan"],
  ]);
  assert.equal(result.suggestions.length, 2);
  assert.equal(result.classifications[1].evidence[0].location, "Paragraph 1");
});

test("missing, duplicate, invented and cross-document classification evidence fail closed", () => {
  for (const invalid of [
    classifications.slice(0, 1), [classifications[0], classifications[0]],
    [classifications[0], { ...classifications[1], documentId: "unknown" }],
    [classifications[0], { ...classifications[1], evidence: classifications[0].evidence }],
    [classifications[0], { ...classifications[1], evidence: [{ sourceId: "d2s1", quote: "This text was invented." }] }],
    [classifications[0], { ...classifications[1], evidence: [] }],
  ]) assert.throws(() => verifyClassifications(invalid, sources));
});

test("real quotes cannot cross document purposes or use categories from a different purpose", () => {
  const output = extractionSchema.parse({ classifications, suggestions: [
    survey, plan, { ...survey, evidence: plan.evidence },
    { ...plan, category: "Answer formats" },
    { ...plan, evidence: [...survey.evidence, ...plan.evidence] },
  ] });
  const result = verifyAnalysis(output, sources);
  assert.deepEqual(result.suggestions.map((item) => item.purpose), ["questionnaire", "research_plan"]);
  assert.equal(result.rejectedCount, 3);
});

test("other and uncertain documents keep classifications but cannot supply preferences", () => {
  const output = extractionSchema.parse({ classifications: classifications.map((item, i) => ({ ...item,
    purpose: i ? "uncertain" : "other", evidence: [],
  })), suggestions: [survey, plan] });
  const result = verifyAnalysis(output, sources);
  assert.equal(result.classifications.length, 2);
  assert.deepEqual(result.suggestions, []);
  assert.equal(result.rejectedCount, 2);
});

test("the service makes one model request and returns source-backed classifications even with no suggestions", async () => {
  const model = new MockLanguageModelV4({ doGenerate: {
    content: [{ type: "text", text: JSON.stringify({ classifications, suggestions: [] }) }],
    finishReason: { unified: "stop", raw: undefined }, warnings: [],
    usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 100, text: 100, reasoning: undefined } },
  } });
  const result = await analyzeDocuments(input, { model });
  assert.equal(model.doGenerateCalls.length, 1);
  assert.equal(result.classifications[1].purpose, "research_plan");
  assert.deepEqual(result.suggestions, []);
});

test("evaluation measures every document's expected type and fails incorrect predictions", async () => {
  const testCase = classificationCases.find((item) => item.id === "mixed-document-purposes")!;
  const { sources } = await loadCase(testCase);
  const classifications = classificationFixture(sources).map((item) => ({ ...item,
    purpose: testCase.expectedPurposes![sources.find((source) => source.documentId === item.documentId)!.document],
  }));
  const checks = deterministicChecks(testCase, { classifications }, [], 0, sources).filter((check) => check.name.startsWith("Document type:"));
  assert.equal(checks.length, 5);
  assert.ok(checks.every((check) => check.passed));
  classifications[1].purpose = "questionnaire";
  assert.ok(deterministicChecks(testCase, { classifications }, [], 0, sources).some((check) => check.name.startsWith("Document type:") && !check.passed));
});
