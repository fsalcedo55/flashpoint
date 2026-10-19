import type { SourcePassage, VerifiedSuggestion, extractionSchema } from "../src/server/preference-extraction";
import type { z } from "zod";
import type { Grade, Check } from "./grading";

export type CaseResult = {
  caseId: string;
  repetition: number;
  status: "passed" | "quality-failure" | "error";
  sources?: SourcePassage[];
  sourceHash?: string;
  raw?: z.infer<typeof extractionSchema>;
  suggestions?: VerifiedSuggestion[];
  checks: Check[];
  grade?: Grade;
  coverage?: { found: number; total: number; ids: string[] };
  generationMs?: number;
  judgeMs?: number;
  usage?: { generationInput: number | null; generationOutput: number | null; generationReasoning?: number | null; judgeInput: number | null; judgeOutput: number | null };
  error?: string;
};
export type Report = {
  startedAt: string;
  completedAt?: string;
  model: string;
  judgeModel: string;
  promptVersion: string;
  extractionSettings?: { reasoning: string; maxOutputTokens: number; maxRetries: number; timeout: number };
  rubricVersion: string;
  suiteVersion: string;
  codeHash: string;
  gitCommit: string;
  workingTreeDirty: boolean;
  nodeVersion: string;
  sdkVersion: string;
  plannedRuns: number;
  setupError?: string;
  calibration?: { passed: boolean; checks: Check[]; grade: Grade; inputTokens: number | null; outputTokens: number | null };
  results: CaseResult[];
};
const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
export function renderReport(report: Report) {
  const lines = ["# Questionnaire preference evaluation", "",
    `Started: ${report.startedAt}. Model: ${report.model}. Judge: ${report.judgeModel}.`,
    `Prompt: ${report.promptVersion}; rubric: ${report.rubricVersion}; suite: ${report.suiteVersion}.`,
    ...(report.extractionSettings ? [`Extraction settings: ${report.extractionSettings.reasoning} reasoning; ${report.extractionSettings.maxOutputTokens} output tokens maximum; ${report.extractionSettings.timeout / 1000}s timeout; ${report.extractionSettings.maxRetries} retries.`] : []),
    `Commit: ${report.gitCommit}${report.workingTreeDirty ? " (working tree changes included in code hash)" : ""}. Code SHA-256: ${report.codeHash}.`,
    `Completed ${report.results.length}/${report.plannedRuns} runs${report.completedAt ? ` at ${report.completedAt}` : " so far (incomplete)"}.`, "",
    ...(report.setupError ? [`Setup error: ${report.setupError}`, ""] : []),
    ...(report.calibration ? [`Judge calibration: ${report.calibration.passed ? "passed" : "FAILED"} (${report.calibration.checks.filter((check) => check.passed).length}/${report.calibration.checks.length} labeled checks).`, "", ...report.calibration.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} — ${check.name}: ${check.detail}`), ""] : []),
    "AI grades are advisory, not ground truth. The judge may share the extractor's biases. Pattern coverage measures seven curated targets, not all possible valid preferences. A pass requires valid quotes, appropriate abstention/nonempty output, no injection failure, and favorable semantic grades for every suggestion and case criterion. Coverage is reported separately; missing a target does not by itself fail a case. Operational errors are never counted as quality passes.", "",
    "| Case | Repeat | Outcome | Suggestions | Target coverage | Generation / judge |",
    "| --- | ---: | --- | ---: | --- | --- |",
    ...report.results.map((result) => `| ${result.caseId} | ${result.repetition} | ${result.status} | ${result.suggestions?.length ?? "—"} | ${result.coverage?.total ? `${result.coverage.found}/${result.coverage.total}` : "n/a"} | ${result.generationMs === undefined ? "—" : (result.generationMs / 1000).toFixed(1) + "s"} / ${result.judgeMs === undefined ? "—" : (result.judgeMs / 1000).toFixed(1) + "s"} |`), "",
  ];
  for (const result of report.results) {
    lines.push(`## ${result.caseId} · repeat ${result.repetition}`, "");
    if (result.error) lines.push(`Operational error: ${result.error}`, "");
    lines.push(...result.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} — ${cell(check.name)}: ${cell(check.detail)}`), "");
    if (result.usage) lines.push(`Tokens (input/output): generation ${result.usage.generationInput ?? "unknown"}/${result.usage.generationOutput ?? "unknown"}; judge ${result.usage.judgeInput ?? "unknown"}/${result.usage.judgeOutput ?? "unknown"}.`, "");
    if (result.usage?.generationReasoning != null) lines.push(`Generation reasoning tokens (included in output): ${result.usage.generationReasoning}.`, "");
    for (const [index, suggestion] of (result.suggestions ?? []).entries()) {
      lines.push(`### ${index + 1}. ${suggestion.title}`, "", suggestion.rule, "", suggestion.rationale, "");
      for (const evidence of suggestion.evidence) {
        const source = result.sources?.find((item) => item.documentId === evidence.documentId && item.location === evidence.location);
        lines.push(`- ${source?.document ?? evidence.documentId}, ${evidence.location}: ${JSON.stringify(evidence.quote)}`);
      }
      lines.push("");
    }
    if (result.grade?.patterns.length) lines.push("### Target coverage", "",
      ...result.grade.patterns.map((pattern) => `- ${pattern.id}: ${result.coverage?.ids.includes(pattern.id) ? "covered" : "missing or weak"}. ${pattern.reason}`), "");
  }
  return lines.join("\n");
}
