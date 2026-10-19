import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createGateway } from "ai";
import { aiConfiguration, extractionModel } from "../src/server/ai-provider";
import { EXTRACTION_SETTINGS, generatePreferences, PROMPT_VERSION, verifyEvidence } from "../src/server/preference-extraction";
import { cases, SUITE_VERSION } from "./cases";
import { loadCase } from "./fixtures";
import { coverage, deterministicChecks, gradeChecks, gradeSuggestions, RUBRIC_VERSION } from "./grading";
import { renderReport, type CaseResult, type Report } from "./report";
import { calibrateJudge } from "./calibration";

async function main() {
  const { values } = parseArgs({ options: {
    case: { type: "string", multiple: true }, repeat: { type: "string", default: "1" },
    out: { type: "string", default: ".data/evals" }, list: { type: "boolean" },
  } });
  if (values.list) { cases.forEach((item) => console.log(`${item.id}: ${item.description}`)); return; }
  const repeats = Number(values.repeat);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error("--repeat must be 1, 2, or 3.");
  const selected = values.case?.length ? values.case.map((id) => {
    const item = cases.find((entry) => entry.id === id);
    if (!item) throw new Error(`Unknown case: ${id}. Use --list.`);
    return item;
  }) : cases;
  if (new Set(selected.map((item) => item.id)).size !== selected.length) throw new Error("Select each case only once.");
  const config = aiConfiguration();
  if (!config.configured) throw new Error("Set AI_GATEWAY_API_KEY in .env.local or the environment. No requests made.");
  const judgeModel = process.env.AI_EVAL_JUDGE_MODEL?.trim() || "openai/gpt-6.1-sol";
  const model = extractionModel();
  const judge = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY?.trim() })(judgeModel);
  const paths = ["src/server/preference-extraction.ts", "src/server/analyses.ts", "src/server/ai-provider.ts", "src/server/document-extraction.ts", "src/lib/analysis.ts", "src/lib/documents.ts", "evals/cases.ts", "evals/fixtures.ts", "evals/grading.ts", "evals/calibration.ts", "evals/run.ts", "tests/document-fixtures.ts"];
  const hash = createHash("sha256");
  for (const path of paths) hash.update(path).update(await readFile(path));
  const report: Report = { startedAt: new Date().toISOString(), model: config.model, judgeModel,
    promptVersion: PROMPT_VERSION, extractionSettings: EXTRACTION_SETTINGS, rubricVersion: RUBRIC_VERSION, suiteVersion: SUITE_VERSION,
    codeHash: hash.digest("hex"), gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workingTreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
    nodeVersion: process.version, sdkVersion: JSON.parse(await readFile("node_modules/ai/package.json", "utf8")).version,
    plannedRuns: selected.length * repeats, results: [] };
  await mkdir(resolve(values.out), { recursive: true });
  const directory = await mkdtemp(resolve(values.out, new Date().toISOString().replaceAll(/[:.]/g, "-") + "-"));
  const save = async () => {
    await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    await writeFile(resolve(directory, "report.md"), renderReport(report));
  };
  await save();
  console.log(`Model: ${config.model}; judge: ${judgeModel}. ${report.plannedRuns} runs plus calibration, at most ${report.plannedRuns * 2 + 1} paid model calls; no retries.`);
  console.log(`Reports: ${directory}`);
  console.log("Checking judge against six labeled examples…");
  try {
    report.calibration = await calibrateJudge(judge);
  } catch {
    report.setupError = "Judge calibration could not complete. No extraction runs were started.";
    await save();
    console.error(report.setupError);
    process.exitCode = 2;
    return;
  }
  await save();
  if (!report.calibration.passed) {
    console.error("Judge calibration failed. Inspect its explanations before trusting semantic grades. No extraction runs were started.");
    process.exitCode = 2;
    return;
  }
  for (const testCase of selected) for (let repetition = 1; repetition <= repeats; repetition++) {
    const result: CaseResult = { caseId: testCase.id, repetition, status: "error", checks: [] };
    let stage = "fixture extraction";
    try {
      Object.assign(result, await loadCase(testCase));
      stage = "generation";
      console.log(`[${testCase.id} ${repetition}/${repeats}] generating…`);
      const start = performance.now();
      const generated = await generatePreferences(model, result.sources!);
      result.generationMs = Math.round(performance.now() - start);
      result.raw = generated.output;
      const verified = verifyEvidence(generated.output, result.sources!);
      result.suggestions = verified.suggestions;
      result.usage = { generationInput: generated.inputTokens ?? null, generationOutput: generated.outputTokens ?? null, judgeInput: null, judgeOutput: null };
      result.checks = deterministicChecks(testCase, result.raw, result.suggestions, verified.rejectedCount, result.sources!);
      stage = "semantic grading";
      console.log(`[${testCase.id} ${repetition}/${repeats}] grading ${result.suggestions.length} suggestions…`);
      const judgeStart = performance.now();
      const graded = await gradeSuggestions(judge, testCase, result.sources!, result.suggestions);
      result.judgeMs = Math.round(performance.now() - judgeStart);
      result.grade = graded.grade;
      result.usage.judgeInput = graded.inputTokens;
      result.usage.judgeOutput = graded.outputTokens;
      result.coverage = coverage(graded.grade, testCase.patterns);
      result.checks.push(...gradeChecks(graded.grade));
      result.status = result.checks.every((check) => check.passed) ? "passed" : "quality-failure";
    } catch (error) {
      // SDK errors may include request bodies or credentials. Never serialize the raw error.
      const name = error instanceof Error && /^[A-Za-z_]+Error$/.test(error.name) ? error.name : "Error";
      result.error = `${stage} failed (${name}). Check model access/credits and rerun this case. No grade was assumed.`;
    }
    report.results.push(result);
    await save();
    console.log(`[${testCase.id} ${repetition}/${repeats}] ${result.status}${result.coverage?.total ? `; coverage ${result.coverage.found}/${result.coverage.total}` : ""}`);
  }
  report.completedAt = new Date().toISOString();
  await save();
  const errors = report.results.filter((item) => item.status === "error").length;
  const failures = report.results.filter((item) => item.status === "quality-failure").length;
  console.log(`${report.results.length - failures - errors} passed, ${failures} quality failures, ${errors} operational errors. See ${directory}/report.md`);
  process.exitCode = errors ? 2 : failures ? 1 : 0;
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Evaluation could not start.");
  process.exitCode = 2;
});
