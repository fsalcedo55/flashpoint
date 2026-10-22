import assert from "node:assert/strict";
import { test } from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { calibrateJudge } from "../evals/calibration";
import { cases } from "../evals/cases";
import { loadCase } from "../evals/fixtures";
import { coverage, deterministicChecks, gradeChecks, validateGrade, type Grade } from "../evals/grading";
import type { VerifiedSuggestion } from "../src/server/ai/preference-extraction";
import { MAX_ANALYSIS_CHARACTERS, serializeAnalysisSources } from "../src/lib/analysis";

const simpleCase = { id: "unit", description: "Test case", files: [], patterns: [{ id: "scales", description: "Labeled scales" }], criteria: [{ id: "scope", description: "Preserve scope" }] };
const grade = (): Grade => ({
  suggestions: [{ id: 1, support: "supported", scope: "appropriate", reusable: true, reason: "The quoted scale labels support the rule." }],
  criteria: [{ id: "scope", passed: true, reason: "The rule is scoped to evaluative questions.", suggestionIds: [1] }],
  patterns: [{ id: "scales", suggestionIds: [1], reason: "The rule calls for fully labeled opinion scales." }],
});
const suggestion: VerifiedSuggestion = { category: "Answer formats", title: "Label opinion scales", rule: "Use fully labeled five-point opinion scales.", rationale: "The opinion scales have a label for each response.", evidence: [{ documentId: "doc", location: "Paragraph 1", quote: "Strongly disagree; disagree; neutral; agree; strongly agree." }] };

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
