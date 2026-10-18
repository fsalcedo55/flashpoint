import { TRPCError } from "@trpc/server";
import { asc, count, eq } from "drizzle-orm";
import type { Preference } from "../lib/preferences";
import type { Database } from "./db";
import { analyses, documents, evidence, preferences } from "./db/schema";

export async function deletePreference(db: Database, id: string) {
  return db.transaction(async (tx) => {
    // Evidence cascades.
    const [deleted] = await tx.delete(preferences).where(eq(preferences.id, id))
      .returning({ id: preferences.id, analysisId: preferences.analysisId });
    if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "This preference no longer exists." });
    // Completed analyses are reused by fingerprint. Forget one that has no suggestions left,
    // so running the same documents again can suggest afresh instead of returning nothing.
    if (deleted.analysisId) {
      const [remaining] = await tx.select({ total: count() }).from(preferences).where(eq(preferences.analysisId, deleted.analysisId));
      if (remaining.total === 0) await tx.delete(analyses).where(eq(analyses.id, deleted.analysisId));
    }
    return { id: deleted.id };
  });
}

export async function listPreferences(db: Database): Promise<Preference[]> {
  const rows = await db.select({
    preference: preferences,
    document: documents.name,
    documentId: documents.id,
    location: evidence.location,
    quote: evidence.quote,
  }).from(preferences)
    .leftJoin(evidence, eq(evidence.preferenceId, preferences.id))
    .leftJoin(documents, eq(evidence.documentId, documents.id))
    .orderBy(asc(preferences.position), asc(preferences.id), asc(evidence.position));

  const result = new Map<string, Preference>();
  for (const { preference, document, documentId, location, quote } of rows) {
    let item = result.get(preference.id);
    if (!item) {
      item = {
        id: preference.id,
        category: preference.category,
        title: preference.title,
        rule: preference.rule,
        rationale: preference.rationale,
        status: preference.status,
        version: preference.version,
        evidence: [],
      };
      result.set(item.id, item);
    }
    if (document !== null && location !== null && quote !== null) {
      item.evidence.push({ documentId: documentId ?? undefined, document, location, quote });
    }
  }
  return [...result.values()];
}
