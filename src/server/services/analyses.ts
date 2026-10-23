import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { GatewayError } from "@ai-sdk/gateway";
import { APICallError, NoObjectGeneratedError, type LanguageModel } from "ai";
import { prepareAnalysisSources, type AnalysisInput, type AnalysisResult } from "../../lib/analysis";
import { extractionModel } from "../ai/provider";
import { generatePreferences, streamPreferences, verifyAnalysis } from "../ai/preference-extraction";

function publicAnalysisError(error: unknown) {
  if (error instanceof TRPCError) return error.message;
  // AI SDK 7 wraps Gateway authentication failures and drops their status code.
  if (error instanceof Error && (error.name === "GatewayAuthenticationError" || error.name === "GatewayError")) {
    return "Vercel AI Gateway rejected the credentials. Check the Gateway API key and try again.";
  }
  if (GatewayError.isInstance(error)) {
    if (error.statusCode === 401) return "Vercel AI Gateway rejected the credentials. Check the Gateway API key and try again.";
    if (error.statusCode === 402) return "Vercel AI Gateway credits or budget are exhausted. Check credits and spending limits in Vercel, then retry.";
    if (error.statusCode === 403) return "Vercel AI Gateway denied access. Check account verification and model permissions in Vercel, then retry.";
    if (error.statusCode === 404) return "The configured model is unavailable through Vercel AI Gateway. Check the model ID and access, then retry.";
    if (error.statusCode === 429) return "Vercel AI Gateway or the model provider reached a rate limit. Wait before retrying.";
    return "Vercel AI Gateway could not complete the request. Check model access and try again.";
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return "The AI provider rejected the credentials. Check the API key and model access, then retry.";
    if (error.statusCode === 429) return "The AI provider's rate limit or quota was reached. Check billing or wait before retrying.";
    return "The AI provider could not complete the request. Check model access and try again.";
  }
  if (NoObjectGeneratedError.isInstance(error)) return "The AI response was incomplete or did not match the expected format. Try again.";
  if (error instanceof Error && /abort|timeout/i.test(error.name)) return "The AI request timed out. Try again with fewer documents.";
  return "Analysis could not be completed. No new suggestions were added. Try again.";
}

// Tests inject a model here; requests cannot select a test model or bypass the provider.
// With `onNote`, the model is streamed and its reasoning summary is relayed as it arrives.
export async function analyzeDocuments(input: AnalysisInput, options: { model?: LanguageModel; onNote?: (text: string) => void; signal?: AbortSignal } = {}): Promise<AnalysisResult> {
  let sources: ReturnType<typeof prepareAnalysisSources>;
  try {
    sources = prepareAnalysisSources(input);
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message });
  }
  const model = options.model ?? extractionModel();
  try {
    const generated = options.onNote
      ? await streamPreferences(model, sources, options.onNote, { signal: options.signal })
      : await generatePreferences(model, sources);
    let verified: ReturnType<typeof verifyAnalysis>;
    try {
      verified = verifyAnalysis(generated.output, sources);
    } catch {
      throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "The AI response did not classify every document with valid source references. Try again." });
    }
    if (generated.output.suggestions.length && !verified.suggestions.length) {
      throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "None of the suggested preferences had verifiable source evidence matching their document type. Try again." });
    }
    return {
      classifications: verified.classifications,
      rejectedCount: verified.rejectedCount,
      suggestions: verified.suggestions.map((suggestion) => ({
        ...suggestion, id: randomUUID(), suggestedRule: suggestion.rule, status: "pending",
        evidence: suggestion.evidence.map((source) => ({ ...source,
          document: sources.find((passage) => passage.documentId === source.documentId)!.document })),
      })),
    };
  } catch (error) {
    throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: publicAnalysisError(error) });
  }
}
