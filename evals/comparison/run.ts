import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createGateway } from "ai";
import { aiConfiguration, extractionModel } from "../../src/server/ai/provider";
import { EXTRACTION_SETTINGS, PROMPT_VERSION, type VerifiedSuggestion } from "../../src/server/ai/preference-extraction";
import { serializeAnalysisSources } from "../../src/lib/analysis";
import { calibrateJudge } from "../calibration";
import { coverage, deterministicChecks, gradeChecks, gradeSuggestions, RUBRIC_VERSION, type Check, type Grade } from "../grading";
import { fictionalCases, loadPrivateCase, validateSources } from "./cases";
import { DOCUMENT_EXTRACTION_PATHS } from "../code-snapshot";
import { runStrategies, type Strategy } from "./execution";
import { chunks, COMPARISON_VERSION, costEstimate, discover, fingerprint, fullContext, newCache, reconcile, retrievalContext, SETTINGS, type OutputData, type Usage } from "./strategies";

type Result = { caseId: string; repetition: number; strategy: Strategy; status: "generated" | "passed" | "quality-failure" | "error";
  elapsedMs?: number; contextPassages?: number; reusedChunks?: number; stageRejections?: number; usage?: Usage[]; estimatedUsd?: number | null;
  raw?: OutputData; suggestions?: VerifiedSuggestion[]; grade?: Grade; coverage?: ReturnType<typeof coverage>; checks?: Check[];
  judgeUsage?: { input: number | null; output: number | null; ms: number }; error?: string };

async function main() {
  const { values } = parseArgs({ options: { repeat: { type: "string", default: "2" }, input: { type: "string" },
    out: { type: "string", default: ".data/comparisons" }, plan: { type: "boolean" } } });
  const repeats = Number(values.repeat);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error("--repeat must be 1, 2 or 3.");
  const selected = values.input ? [await loadPrivateCase(values.input)] : await fictionalCases();
  selected.forEach((item) => validateSources(item.sources));
  const maxOperations = 1 + repeats * selected.reduce((sum, item) => sum + 7 + chunks(item.sources, SETTINGS.mapCharacters).length + new Set(item.sources.map((source) => source.documentId)).size, 0);
  console.log(`Plan: ${selected.length} cases × ${repeats} repeats × 3 strategies. At most ${maxOperations} paid SDK operations including grading; no automatic retries.`);
  selected.forEach((item) => console.log(`${item.rubric.id}: ${item.sources.length} passages, ${serializeAnalysisSources(item.sources).length} source-payload characters; ${item.reusePrevious ? "reuse preceding document work" : "cold start"}.`));
  if (values.plan) return;
  const config = aiConfiguration();
  if (!config.configured) throw new Error("AI_GATEWAY_API_KEY is required. No requests made.");
  const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY?.trim() });
  const model = extractionModel();
  const embeddingId = "openai/text-embedding-3-small";
  const judgeId = process.env.AI_EVAL_JUDGE_MODEL?.trim() || "openai/gpt-6.1-sol";
  const judge = gateway(judgeId);
  const files = [...DOCUMENT_EXTRACTION_PATHS, "evals/code-snapshot.ts", "evals/comparison/strategies.ts", "evals/comparison/cases.ts", "evals/comparison/execution.ts", "evals/comparison/run.ts", "evals/grading.ts", "evals/calibration.ts", "evals/cases.ts", "evals/fixtures.ts", "tests/document-fixtures.ts", "src/lib/analysis.ts", "src/server/ai/preference-extraction.ts", "src/server/ai/source-prompt.ts", "src/server/ai/provider.ts"];
  const codeSnapshot = await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")]));
  const report = { startedAt: new Date().toISOString(), completedAt: null as string | null, version: COMPARISON_VERSION,
    model: config.model, embeddingModel: embeddingId, judgeModel: judgeId, promptVersion: PROMPT_VERSION, rubricVersion: RUBRIC_VERSION,
    settings: { ...SETTINGS, ...EXTRACTION_SETTINGS }, repeats, maxOperations,
    codeHash: fingerprint(codeSnapshot),
    gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
    node: process.version, sdk: JSON.parse(await readFile("node_modules/ai/package.json", "utf8")).version,
    priceAssumptions: { date: "2026-10-21", inputPerMillion: 0.10, outputPerMillion: 0.50, embeddingsPerMillion: 0.02,
      sources: ["https://vercel.com/ai-gateway/models/gpt-6-luna", "https://vercel.com/ai-gateway/models/text-embedding-3-small"],
      note: "Starting list prices, no cache discounts. Estimates exclude judge cost and are not actual bills. Shared discovery is charged to both candidate architectures, but executed once per comparison. Elapsed times include shared discovery, exclude grading, and use concurrency two for discovery/indexing." },
    cases: selected.map((item) => ({ ...item, sourceHash: fingerprint(item.sources), payloadCharacters: serializeAnalysisSources(item.sources).length })),
    calibration: null as Awaited<ReturnType<typeof calibrateJudge>> | null,
    results: [] as Result[], setupError: null as string | null,
  };
  await mkdir(resolve(values.out), { recursive: true });
  const directory = await mkdtemp(resolve(values.out, new Date().toISOString().replaceAll(/[:.]/g, "-") + "-"));
  await writeFile(resolve(directory, "code-snapshot.json"), JSON.stringify(codeSnapshot, null, 2) + "\n");
  const save = async () => {
    await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
    const rows = report.results.map((r) => {
      const strong = r.grade?.suggestions.filter((s) => s.support === "supported" && s.scope === "appropriate" && s.reusable).length;
      return `| ${r.caseId} | ${r.repetition} | ${r.strategy} | ${r.status} | ${r.elapsedMs === undefined ? "—" : (r.elapsedMs / 1000).toFixed(1)} | ${r.estimatedUsd == null ? "—" : r.estimatedUsd.toFixed(4)} | ${strong ?? "—"}/${r.suggestions?.length ?? "—"} | ${r.coverage ? `${r.coverage.found}/${r.coverage.total}` : "—"} | ${r.reusedChunks ?? 0} | ${r.contextPassages ?? "—"} |`;
    });
    await writeFile(resolve(directory, "report.md"), `# Architecture comparison\n\n${report.completedAt ? "Completed" : "Incomplete"}. Model: ${config.model}, medium reasoning. Judge: ${judgeId}. Embeddings: ${embeddingId}.\n\n${report.priceAssumptions.note}\n\n| Case | Run | Strategy | Status | Seconds | Est. USD | Strong / returned | Targets | Reused chunks | Final context passages |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\nSee report.json for raw outputs, grades, source/code hashes, full inputs and intermediate files for each case. Strong/returned is a fallible AI judgment, not measured ground-truth precision. Targets are curated coverage, not exhaustive recall. Two runs cannot establish reliability.\n\nThe long case is deliberately repetitive synthetic load, not evidence of performance on arbitrary long customer documents. The add-fourth case reuses document analysis and vectors from the preceding three-document case; full context must resubmit the whole collection. Each repetition starts with empty application caches. Provider prompt-cache effects are uncontrolled.\n`);
  };
  await save(); console.log(`Reports: ${directory}`);
  try { report.calibration = await calibrateJudge(judge); }
  catch { report.setupError = "Judge calibration failed operationally; no extraction started."; }
  await save();
  if (!report.calibration?.passed) { process.exitCode = 2; return; }

  for (let repetition = 1; repetition <= repeats; repetition++) {
    let cache = newCache();
    for (let caseIndex = 0; caseIndex < selected.length; caseIndex++) {
      const { rubric, sources, reusePrevious } = selected[caseIndex];
      if (!reusePrevious) cache = newCache();
      const prefix = `${caseIndex + 1}-${repetition}`;
      const artifact = (name: string, data: unknown) => writeFile(resolve(directory, `${prefix}-${name}.json`), JSON.stringify(data, null, 2) + "\n");
      const record = async (strategy: Result["strategy"], output: Awaited<ReturnType<typeof fullContext>>, usage: Usage[], elapsedMs: number, contextPassages: number, reusedChunks = 0, stageRejections = 0) => {
        const result: Result = { caseId: rubric.id, repetition, strategy, status: "generated", raw: output.raw, suggestions: output.suggestions,
          usage, elapsedMs, contextPassages, reusedChunks, stageRejections, estimatedUsd: costEstimate(usage, config.model, embeddingId),
          checks: deterministicChecks(rubric, output.raw, output.suggestions, output.rejectedCount, sources) };
        report.results.push(result); await save();
        console.log(`[${rubric.id} ${repetition}] ${strategy}: generated ${output.suggestions.length}; grading…`);
        try {
          const begin = performance.now();
          const graded = await gradeSuggestions(judge, rubric, sources, output.suggestions);
          result.grade = graded.grade; result.coverage = coverage(graded.grade, rubric.patterns);
          result.judgeUsage = { input: graded.inputTokens, output: graded.outputTokens, ms: Math.round(performance.now() - begin) };
          result.checks!.push(...gradeChecks(graded.grade), { name: "Grounded intermediate observations", passed: stageRejections === 0, detail: `${stageRejections} discovery citations/candidates discarded.` });
          result.status = result.checks!.every((check) => check.passed) ? "passed" : "quality-failure";
        } catch { result.status = "error"; result.error = "Semantic grading failed; extraction result retained, no grade assumed."; }
        await save(); console.log(`[${rubric.id} ${repetition}] ${strategy}: ${result.status}; targets ${result.coverage?.found ?? "?"}/${rubric.patterns.length}.`);
      };
      const runFull = async () => {
        console.log(`[${rubric.id} ${repetition}] full context…`);
        const output = await fullContext(model, sources);
        await record("full", output, [output.usage], output.usage.ms, sources.length);
      };
      await runStrategies(repetition, {
        full: runFull,
        discover: async () => {
          console.log(`[${rubric.id} ${repetition}] shared discovery…`);
          const discovery = await discover(model, sources, cache);
          await artifact("discovery", discovery);
          return discovery;
        },
        perDocument: async (discovery) => {
          const output = await reconcile(model, sources, discovery.context, discovery);
          await record("per-document", output, [...discovery.usage, output.usage], discovery.ms + output.usage.ms, discovery.context.length,
            discovery.reused, discovery.mapped.reduce((sum, item) => sum + item.rejected, 0));
        },
        retrieval: async (discovery) => {
          console.log(`[${rubric.id} ${repetition}] embedding and retrieval…`);
          const retrieved = await retrievalContext(gateway.embeddingModel(embeddingId), sources, discovery, cache);
          await artifact("retrieval", retrieved);
          const output = await reconcile(model, sources, retrieved.context, discovery);
          await record("retrieval", output, [...discovery.usage, ...retrieved.usage, output.usage], discovery.ms + retrieved.ms + output.usage.ms,
            retrieved.context.length, discovery.reused, discovery.mapped.reduce((sum, item) => sum + item.rejected, 0));
        },
        onError: async (strategy) => {
          // Do not serialize SDK exceptions: they may contain private request bodies.
          const existing = report.results.find((r) => r.caseId === rubric.id && r.repetition === repetition && r.strategy === strategy);
          const error = "Generation/dependency failed; no automatic retry. In-flight/failed calls may incur unreported cost.";
          if (existing) { existing.status = "error"; existing.error = error; }
          else {
            report.results.push({ caseId: rubric.id, repetition, strategy, status: "error", error });
          }
          await save(); console.log(`[${rubric.id} ${repetition}] ${strategy}: operational failure; inspect retained artifacts.`);
        },
      });
    }
  }
  report.completedAt = new Date().toISOString(); await save();
  process.exitCode = report.results.some((r) => r.status === "error") ? 2 : report.results.some((r) => r.status === "quality-failure") ? 1 : 0;
  console.log(`Finished. ${directory}/report.md`);
}

main().catch(() => { console.error("Comparison setup failed. Check input format, size budgets and configuration. No raw error was logged."); process.exitCode = 2; });
