import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { GatewayError } from "@ai-sdk/gateway";
import { APICallError, NoObjectGeneratedError, type LanguageModel } from "ai";
import { analysisInputSchema, MAX_ANALYSIS_CHARACTERS, type AnalysisInput, type AnalysisResult } from "../lib/analysis";
import { extractionModel } from "./ai-provider";
import { generatePreferences, verifyEvidence, type SourcePassage } from "./preference-extraction";

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

// The request contains all source text. Nothing is retained between requests.
// Tests inject a model here; requests cannot select a test model or bypass the provider.
export async function analyzeDocuments(input: AnalysisInput, testing?: { model: LanguageModel }): Promise<AnalysisResult> {
  const parsed = analysisInputSchema.safeParse(input);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Provide one to five documents with extracted text." });
  const { documents } = parsed.data;
  if (new Set(documents.map((document) => document.id)).size !== documents.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Select different documents." });
  }
  if (documents.some((document) => !document.sections.some((section) => section.text.trim()))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Each document needs readable text." });
  }
  const sources: SourcePassage[] = documents.flatMap((document, documentIndex) => document.sections.map((section, index) => ({
    sourceId: `d${documentIndex + 1}s${index + 1}`, documentId: document.id, document: document.name, ...section,
  }))).filter((source) => source.text.trim());
  if (JSON.stringify(sources).length > MAX_ANALYSIS_CHARACTERS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This selection exceeds 80,000 characters including source references. Choose fewer or smaller documents; no text has been sent." });
  }
  const model = testing?.model ?? extractionModel();
  try {
    const generated = await generatePreferences(model, sources);
    const verified = verifyEvidence(generated.output, sources);
    if (generated.output.suggestions.length && !verified.suggestions.length) {
      throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "None of the suggested preferences had verifiable source quotes. Try again." });
    }
    return {
      rejectedCount: verified.rejectedCount,
      suggestions: verified.suggestions.map((suggestion) => ({
        ...suggestion, id: randomUUID(), suggestedRule: suggestion.rule, status: "pending",
        evidence: suggestion.evidence.map((source) => ({ ...source,
          document: documents.find((document) => document.id === source.documentId)!.name })),
      })),
    };
  } catch (error) {
    throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: publicAnalysisError(error) });
  }
}
