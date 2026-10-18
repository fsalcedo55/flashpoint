import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { GatewayError } from "@ai-sdk/gateway";
import { APICallError, NoObjectGeneratedError, type LanguageModel } from "ai";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { MAX_ANALYSIS_CHARACTERS, MAX_ANALYSIS_DOCUMENTS } from "../lib/analysis";
import type { Database } from "./db";
import { analyses, documents, evidence, preferences } from "./db/schema";
import { aiConfiguration, extractionModel } from "./ai-provider";
import { generatePreferences, PROMPT_VERSION, verifyEvidence, type SourcePassage } from "./preference-extraction";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const ruleKey = (rule: string) => hash(rule.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim());

async function expireInterruptedAnalyses(db: Database) {
  await db.update(analyses).set({ status: "failed", error: "Analysis was interrupted or took too long. Select these documents and try again.", finishedAt: new Date() })
    .where(and(eq(analyses.status, "running"), lt(analyses.startedAt, new Date(Date.now() - 120_000))));
}

export async function listAnalyses(db: Database) {
  await expireInterruptedAnalyses(db);
  return db.select({ id: analyses.id, sources: analyses.sources, status: analyses.status,
    suggestionCount: analyses.suggestionCount, rejectedCount: analyses.rejectedCount,
    error: analyses.error, startedAt: analyses.startedAt, finishedAt: analyses.finishedAt })
    .from(analyses).orderBy(desc(analyses.startedAt)).limit(10);
}

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
  return "Analysis could not be completed. No new suggestions were saved. Try again.";
}

// Optional dependencies are supplied only by tests, never by a request or environment flag.
export async function analyzeDocuments(db: Database, ids: string[], testing?: { model: LanguageModel; provider: string; modelId: string }) {
  if (!ids.length || ids.length > MAX_ANALYSIS_DOCUMENTS || new Set(ids).size !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Select between one and five different documents." });
  }
  const selected = await db.select().from(documents).where(inArray(documents.id, ids)).orderBy(documents.id);
  if (selected.length !== ids.length || selected.some((document) => document.status !== "ready" || !document.sections.length)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only uploaded documents with ready text can be analyzed." });
  }
  const sources: SourcePassage[] = selected.flatMap((document, documentIndex) => document.sections.map((section, index) => ({
    sourceId: `d${documentIndex + 1}s${index + 1}`, documentId: document.id, document: document.name, ...section,
  }))).filter((source) => source.text.trim());
  if (JSON.stringify(sources).length > MAX_ANALYSIS_CHARACTERS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This selection exceeds 80,000 characters including source references. Choose fewer or smaller documents; no text has been sent." });
  }
  const config = testing ? { provider: testing.provider, model: testing.modelId } : aiConfiguration();
  const fingerprint = hash(JSON.stringify({ sources, provider: config.provider, model: config.model, version: PROMPT_VERSION }));
  await expireInterruptedAnalyses(db);
  const [existing] = await db.select().from(analyses).where(eq(analyses.fingerprint, fingerprint));
  if (existing && existing.status !== "failed") return existing;
  const model = testing?.model ?? extractionModel();
  const attemptToken = randomUUID();
  const [run] = existing
    ? await db.update(analyses).set({ status: "running", attemptToken, error: null, finishedAt: null, startedAt: new Date() })
      .where(and(eq(analyses.id, existing.id), eq(analyses.status, "failed"))).returning()
    : await db.insert(analyses).values({ fingerprint, sources: selected.map(({ id, name }) => ({ id, name })),
      provider: config.provider, model: config.model, promptVersion: PROMPT_VERSION, attemptToken })
      .onConflictDoNothing({ target: analyses.fingerprint }).returning();
  if (!run) {
    const [concurrent] = await db.select().from(analyses).where(eq(analyses.fingerprint, fingerprint));
    return concurrent;
  }
  try {
    const generated = await generatePreferences(model, sources);
    const verified = verifyEvidence(generated.output, sources);
    if (generated.output.suggestions.length && !verified.suggestions.length) {
      throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "None of the suggested preferences had verifiable source quotes. No suggestions were saved. Try again." });
    }
    await db.transaction(async (tx) => {
      // Claim completion inside the same transaction as the suggestions. An expired
      // or replaced attempt cannot save late results or partially write preferences.
      const [claimed] = await tx.update(analyses).set({ status: "completed", finishedAt: new Date(),
        rejectedCount: verified.rejectedCount, inputTokens: generated.inputTokens ?? null, outputTokens: generated.outputTokens ?? null })
        .where(and(eq(analyses.id, run.id), eq(analyses.attemptToken, attemptToken), eq(analyses.status, "running"))).returning({ id: analyses.id });
      if (!claimed) throw new TRPCError({ code: "CONFLICT", message: "This analysis attempt expired. Select the documents and retry." });
      let suggestionCount = 0;
      for (const [position, suggestion] of verified.suggestions.entries()) {
        const [saved] = await tx.insert(preferences).values({ category: suggestion.category, title: suggestion.title,
          suggestedRule: suggestion.rule, rule: suggestion.rule, rationale: suggestion.rationale,
          analysisId: run.id, ruleKey: ruleKey(suggestion.rule), position })
          .onConflictDoNothing({ target: preferences.ruleKey }).returning({ id: preferences.id });
        // Never reset a reviewed preference or rewrite its evidence on a new run.
        if (!saved) continue;
        suggestionCount += 1;
        await tx.insert(evidence).values(suggestion.evidence.map((source, index) => ({
          ...source, preferenceId: saved.id, position: index,
        })));
      }
      await tx.update(analyses).set({ suggestionCount }).where(eq(analyses.id, run.id));
    });
  } catch (error) {
    await db.update(analyses).set({ status: "failed", error: publicAnalysisError(error), finishedAt: new Date() })
      .where(and(eq(analyses.id, run.id), eq(analyses.attemptToken, attemptToken), eq(analyses.status, "running")));
  }
  const [result] = await db.select().from(analyses).where(eq(analyses.id, run.id));
  return result;
}
