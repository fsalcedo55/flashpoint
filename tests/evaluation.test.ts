import { classificationFixture } from "./analysis-fixtures";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { calibrateJudge } from "../evals/calibration";
import { cases } from "../evals/cases";
import { loadCase } from "../evals/fixtures";
import { coverage, deterministicChecks, gradeChecks, gradeSuggestions, validateGrade, type Grade } from "../evals/grading";
import { generatePreferences, type VerifiedSuggestion } from "../src/server/ai/preference-extraction";
import { loadPrivateCase } from "../evals/comparison/cases";
import { MAX_ANALYSIS_CHARACTERS, serializeAnalysisSources } from "../src/lib/analysis";

const simpleCase = { id: "unit", description: "Test case", files: [], patterns: [{ id: "scales", description: "Labeled scales" }], criteria: [{ id: "scope", description: "Preserve scope" }] };
const grade = (): Grade => ({
  suggestions: [{ id: 1, support: "supported", scope: "appropriate", reusable: true, reason: "The quoted scale labels support the rule." }],
  criteria: [{ id: "scope", passed: true, reason: "The rule is scoped to evaluative questions.", suggestionIds: [1] }],
  patterns: [{ id: "scales", suggestionIds: [1], reason: "The rule calls for fully labeled opinion scales." }],
});
const suggestion: VerifiedSuggestion = { purpose: "questionnaire", category: "Answer formats", title: "Label opinion scales", rule: "Use fully labeled five-point opinion scales.", rationale: "The opinion scales have a label for each response.", evidence: [{ documentId: "doc", location: "Paragraph 1", quote: "Strongly disagree; disagree; neutral; agree; strongly agree." }] };

test("private cases retain typed PPTX sources and attach deduplicated images to extraction and grading", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "flashpoint-private-eval-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "input.json");
  const imageDataUrl = "data:image/jpeg;base64,/9j/2Q==";
  const sources = (["notes", "chart", "formatting", "image", "image"] as const).map((kind, index) => ({
    sourceId: `d1s${index + 1}`, documentId: "doc", document: "Report.pptx", location: `Slide ${index + 1}`, text: "Research presentation source", kind,
    extractionWarnings: ["Parsed properties, not a rendered slide."],
    ...(kind === "image" ? { imageId: "image1", imageDataUrl } : {}),
  }));
  await writeFile(path, JSON.stringify({ sources, rubric: simpleCase }));
  const loaded = await loadPrivateCase(path);
  assert.deepEqual(loaded.sources, sources);
  let calls = 0;
  const model = new MockLanguageModelV4({ doGenerate: async (options) => {
    const user = options.prompt.find((message) => message.role === "user");
    assert.ok(user && user.role === "user");
    const files = user.content.filter((part) => part.type === "file");
    assert.equal(files.length, 1);
    assert.equal(files[0].mediaType, "image/jpeg");
    const text = user.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    assert.ok(!text.includes(imageDataUrl));
    assert.match(text, /d1s4, d1s5/);
    assert.match(text, /"kind":"notes"/);
    calls++;
    return { content: [{ type: "text", text: JSON.stringify(calls === 1 ? { classifications: classificationFixture(sources, "research_report"), suggestions: [] } : grade()) }],
      finishReason: { unified: "stop", raw: undefined }, warnings: [],
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 10, text: 10, reasoning: undefined } } };
  } });
  await generatePreferences(model, loaded.sources);
  await gradeSuggestions(model, loaded.rubric, loaded.sources, [suggestion]);
  assert.equal(calls, 2);
  for (const invalid of [{ ...sources[3], imageDataUrl: undefined }, { ...sources[3], imageDataUrl: "https://example.com/private-image.jpg" }, { ...sources[3], kind: "notes" }]) {
    await writeFile(path, JSON.stringify({ sources: [invalid], rubric: simpleCase }));
    await assert.rejects(loadPrivateCase(path));
  }
  await writeFile(path, JSON.stringify({ sources: [sources[0], { ...sources[1], document: "Different report.pptx" }], rubric: simpleCase }));
  await assert.rejects(loadPrivateCase(path), /Each document ID must refer to one document name/);
});

test("grading fails closed on omitted, duplicated or invented IDs", () => {
  assert.doesNotThrow(() => validateGrade(grade(), simpleCase, 1));
  const missing = grade(); missing.suggestions = [];
  const duplicate = grade(); duplicate.criteria.push(duplicate.criteria[0]);
  const invented = grade(); invented.patterns[0].suggestionIds = [99];
  const extra = grade(); extra.criteria[0].id = "invented";
  for (const invalid of [missing, duplicate, invented, extra]) assert.throws(() => validateGrade(invalid, simpleCase, 1));
});

test("a judge cannot inflate coverage using weak or overgeneralized suggestions", () => {
  assert.equal(coverage(grade(), simpleCase.patterns).found, 1);
  for (const change of [{ support: "partial" as const }, { scope: "overgeneralized" as const }, { reusable: false }]) {
    const weak = grade(); Object.assign(weak.suggestions[0], change);
    assert.equal(coverage(weak, simpleCase.patterns).found, 0);
    assert.ok(gradeChecks(weak).some((check) => !check.passed));
  }
  const missing = grade(); missing.patterns[0].suggestionIds = [];
  assert.equal(coverage(missing, simpleCase.patterns).found, 0);
});

test("empty responses cannot pass positive cases; abstention cases reject invented preferences", () => {
  assert.ok(deterministicChecks(simpleCase, {}, [], 0, []).some((check) => !check.passed));
  assert.ok(deterministicChecks({ ...simpleCase, expectEmpty: true }, {}, [suggestion], 0, []).some((check) => !check.passed));
  assert.ok(deterministicChecks({ ...simpleCase, expectEmpty: true }, {}, [], 0, []).every((check) => check.passed));
  assert.ok(deterministicChecks(simpleCase, {}, [suggestion], 1, []).some((check) => !check.passed));
});

test("injection markers and instruction citations are failures even with real quotes", () => {
  const attack = { ...simpleCase, forbiddenText: "MARKER", excludedEvidenceDocument: "attack.docx" };
  const checks = deterministicChecks(attack, { title: "MARKER" }, [suggestion], 0,
    [{ sourceId: "d1s1", documentId: "doc", document: "attack.docx", location: "Paragraph 1", text: suggestion.evidence[0].quote }]);
  assert.equal(checks.filter((check) => !check.passed).length, 2);
});

test("all evaluation fixtures use the production extractor and source limits with stable hashes", async () => {
  for (const testCase of cases) {
    const first = await loadCase(testCase);
    const second = await loadCase(testCase);
    assert.equal(first.sourceHash, second.sourceHash);
    assert.ok(first.sources.length > 0);
    assert.ok(first.sources.every((source) => source.location.startsWith("Paragraph ")));
    assert.ok(serializeAnalysisSources(first.sources).length <= MAX_ANALYSIS_CHARACTERS);
  }
});

test("an indiscriminately positive judge fails calibration", async () => {
  const output = { suggestions: Array.from({ length: 11 }, (_, index) => ({ ...grade().suggestions[0], id: index + 1 })), criteria: [], patterns: [
    { id: "response-format", suggestionIds: [7], reason: "The rule specifies single-choice answering." },
    { id: "scoped-routing", suggestionIds: [10], reason: "The rule retains the applicable five-point scale." },
  ] };
  const model = new MockLanguageModelV4({ doGenerate: {
    content: [{ type: "text", text: JSON.stringify(output) }],
    finishReason: { unified: "stop", raw: undefined },
    usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 100, text: 100, reasoning: undefined } }, warnings: [],
  } });
  const calibration = await calibrateJudge(model);
  assert.equal(calibration.passed, false);
  assert.ok(calibration.checks.some((check) => check.name === "Numeric routing requires scale scope" && !check.passed));
  assert.ok(calibration.checks.some((check) => check.name === "Code-to-answer mapping cannot be guessed" && !check.passed));
});
