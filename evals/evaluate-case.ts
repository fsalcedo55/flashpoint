import type { LanguageModel } from "ai";
import type { SourcePassage } from "../src/lib/analysis";
import { generatePreferences, verifyAnalysis } from "../src/server/ai/preference-extraction";
import type { EvalCase } from "./cases";
import { coverage, deterministicChecks, gradeChecks, gradeSuggestions } from "./grading";
import type { CaseResult } from "./report";

// Keep model-quality failures separate from failures to load, generate, or grade a case.
export async function evaluateCase(testCase: EvalCase, repetition: number, options: {
  model: LanguageModel;
  judge: LanguageModel;
  reasoning: "low" | "medium";
  loadSources: () => Promise<{ sources: SourcePassage[]; sourceHash: string }>;
}): Promise<CaseResult> {
  const result: CaseResult = { caseId: testCase.id, repetition, status: "error", checks: [] };
  let stage = "fixture extraction";
  try {
    Object.assign(result, await options.loadSources());
    stage = "generation";
    const start = performance.now();
    const generated = await generatePreferences(options.model, result.sources!, options.reasoning);
    result.generationMs = Math.round(performance.now() - start);
    result.raw = generated.output;
    result.usage = { generationInput: generated.inputTokens ?? null, generationOutput: generated.outputTokens ?? null,
      generationReasoning: generated.reasoningTokens ?? null, judgeInput: null, judgeOutput: null };
    let verified: ReturnType<typeof verifyAnalysis>;
    try {
      verified = verifyAnalysis(generated.output, result.sources!);
    } catch {
      result.status = "quality-failure";
      result.suggestions = [];
      result.checks = [{ name: "Document classifications", passed: false,
        detail: "The generated response did not classify every document exactly once with valid source evidence. Semantic grading was skipped." }];
      return result;
    }
    result.suggestions = verified.suggestions;
    result.checks = deterministicChecks(testCase, result.raw, result.suggestions, verified.rejectedCount, result.sources!);
    stage = "semantic grading";
    const judgeStart = performance.now();
    const graded = await gradeSuggestions(options.judge, testCase, result.sources!, result.suggestions);
    result.judgeMs = Math.round(performance.now() - judgeStart);
    result.grade = graded.grade;
    result.usage.judgeInput = graded.inputTokens;
    result.usage.judgeOutput = graded.outputTokens;
    result.coverage = coverage(graded.grade, testCase.patterns);
    result.checks.push(...gradeChecks(graded.grade));
    result.status = result.checks.every((check) => check.passed) ? "passed" : "quality-failure";
  } catch (error) {
    // SDK errors may contain request bodies or credentials; never serialize them.
    const name = error instanceof Error && /^[A-Za-z_]+Error$/.test(error.name) ? error.name : "Error";
    result.error = `${stage} failed (${name}). Check model access/credits and rerun this case. No grade was assumed.`;
  }
  return result;
}
