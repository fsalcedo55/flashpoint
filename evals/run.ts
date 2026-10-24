import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createGateway } from "ai";
import { aiConfiguration, extractionModel } from "../src/server/ai/provider";
import { EXTRACTION_SETTINGS, PROMPT_VERSION } from "../src/server/ai/preference-extraction";
import { cases, SUITE_VERSION } from "./cases";
import { loadCase } from "./fixtures";
import { RUBRIC_VERSION } from "./grading";
import { renderReport, type Report } from "./report";
import { evaluateCase } from "./evaluate-case";
import { calibrateJudge } from "./calibration";
import { loadPrivateCase } from "./comparison/cases";
import { MAX_ANALYSIS_CHARACTERS, serializeAnalysisSources } from "../src/lib/analysis";
import { DOCUMENT_EXTRACTION_PATHS } from "./code-snapshot";

async function main() {
  const { values } = parseArgs({ options: {
    case: { type: "string", multiple: true }, repeat: { type: "string", default: "1" },
    out: { type: "string", default: ".data/evals" }, list: { type: "boolean" }, reasoning: { type: "string" }, input: { type: "string" },
  } });
  if (values.list) { cases.forEach((item) => console.log(`${item.id}: ${item.description}`)); return; }
  const reasoning = values.reasoning ?? EXTRACTION_SETTINGS.reasoning;
  if (reasoning !== "low" && reasoning !== "medium") throw new Error("--reasoning must be low or medium.");
  const repeats = Number(values.repeat);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error("--repeat must be 1, 2, or 3.");
  if (values.input && values.case?.length) throw new Error("Choose --input or --case, not both.");
  const privateCase = values.input ? await loadPrivateCase(values.input) : undefined;
  if (privateCase && (serializeAnalysisSources(privateCase.sources).length > MAX_ANALYSIS_CHARACTERS ||
    !privateCase.sources.length || new Set(privateCase.sources.map((s) => s.sourceId)).size !== privateCase.sources.length)) {
    throw new Error("Private input exceeds the analysis budget or has missing/duplicate source IDs.");
  }
  const selected = privateCase ? [privateCase.rubric] : values.case?.length ? values.case.map((id) => {
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
  const paths = [...DOCUMENT_EXTRACTION_PATHS, "evals/code-snapshot.ts", "src/server/ai/preference-extraction.ts", "src/server/ai/source-prompt.ts", "src/server/services/analyses.ts", "src/server/ai/provider.ts", "src/lib/analysis.ts", "evals/cases.ts", "evals/fixtures.ts", "evals/grading.ts", "evals/calibration.ts", "evals/run.ts", "evals/evaluate-case.ts", "evals/comparison/cases.ts", "evals/comparison/strategies.ts", "tests/document-fixtures.ts"];
  const hash = createHash("sha256");
  const snapshot = await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")]));
  for (const [path, text] of snapshot) hash.update(path).update(text);
  const report: Report = { startedAt: new Date().toISOString(), model: config.model, judgeModel,
    promptVersion: PROMPT_VERSION, extractionSettings: { ...EXTRACTION_SETTINGS, reasoning }, rubricVersion: RUBRIC_VERSION, suiteVersion: SUITE_VERSION,
    codeHash: hash.digest("hex"), gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    workingTreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
    nodeVersion: process.version, sdkVersion: JSON.parse(await readFile("node_modules/ai/package.json", "utf8")).version,
    plannedRuns: selected.length * repeats, results: [] };
  await mkdir(resolve(values.out), { recursive: true });
  const directory = await mkdtemp(resolve(values.out, new Date().toISOString().replaceAll(/[:.]/g, "-") + "-"));
  await writeFile(resolve(directory, "code-snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n");
  const save = async () => {
    await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    await writeFile(resolve(directory, "report.md"), renderReport(report));
  };
  await save();
  console.log(`Model: ${config.model}; reasoning: ${reasoning}; judge: ${judgeModel}. ${report.plannedRuns} runs plus calibration, at most ${report.plannedRuns * 2 + 1} paid model calls; no retries.`);
  console.log(`Reports: ${directory}`);
  console.log("Checking judge against labeled support, scope and coverage examples…");
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
    console.log(`[${testCase.id} ${repetition}/${repeats}] evaluating…`);
    const result = await evaluateCase(testCase, repetition, { model, judge, reasoning,
      loadSources: async () => privateCase ? { sources: privateCase.sources,
        sourceHash: createHash("sha256").update(JSON.stringify(privateCase.sources)).digest("hex") } : loadCase(testCase),
    });
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
