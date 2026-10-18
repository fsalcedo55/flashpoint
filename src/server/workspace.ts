import { analyses, documents, preferences } from "./db/schema";
import type { Database } from "./db";
import { removeOriginal } from "./document-storage";

// Start over: every document, suggestion, decision and analysis goes.
export async function resetWorkspace(db: Database) {
  const removed = await db.transaction(async (tx) => {
    // Order matters: preferences reference analyses, and evidence references documents.
    const removedPreferences = await tx.delete(preferences).returning({ id: preferences.id });
    const removedAnalyses = await tx.delete(analyses).returning({ id: analyses.id });
    const removedDocuments = await tx.delete(documents).returning({ storageKey: documents.storageKey });
    return { preferences: removedPreferences.length, analyses: removedAnalyses.length, storageKeys: removedDocuments.map((row) => row.storageKey) };
  });
  await Promise.all(removed.storageKeys.map((key) => key ? removeOriginal(key).catch(() => undefined) : undefined));
  return { documents: removed.storageKeys.length, preferences: removed.preferences, analyses: removed.analyses };
}
