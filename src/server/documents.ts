import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, lt } from "drizzle-orm";
import type { Database } from "./db";
import { documents, evidence } from "./db/schema";
import { DocumentError, extractDocument, validateUpload } from "./document-extraction";
import { readOriginal, removeOriginal, saveOriginal } from "./document-storage";

const summaryColumns = {
  id: documents.id, name: documents.name, fileType: documents.fileType,
  byteSize: documents.byteSize, status: documents.status, error: documents.error,
  warnings: documents.warnings, sectionCount: documents.sectionCount,
  characterCount: documents.characterCount, createdAt: documents.createdAt,
};

export async function listDocuments(db: Database) {
  // A stopped server/request must not leave a document permanently processing.
  // Clearing the token also prevents an old attempt from overwriting a retry.
  await db.update(documents).set({ status: "failed", processingToken: null,
    error: "Processing was interrupted or took too long. Retry extraction.", updatedAt: new Date() })
    .where(and(eq(documents.status, "processing"), lt(documents.updatedAt, new Date(Date.now() - 120_000))));
  return db.select(summaryColumns).from(documents).orderBy(desc(documents.createdAt));
}

export async function getDocument(db: Database, id: string) {
  const [document] = await db.select({ ...summaryColumns, sections: documents.sections })
    .from(documents).where(eq(documents.id, id));
  if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "This document could not be found." });
  return document;
}

async function processDocument(db: Database, document: typeof documents.$inferSelect, token: string, buffer?: Buffer) {
  try {
    if (!document.storageKey || !document.fileType) throw new DocumentError("This document has no stored original. Upload it again.");
    const content = buffer ?? await readOriginal(document.storageKey).catch(() => {
      throw new DocumentError("The original file is missing or unreadable. Restore it in the upload directory, then retry.");
    });
    const extracted = await extractDocument(content, document.fileType);
    await db.update(documents).set({ ...extracted, status: "ready", error: null, processingToken: null, updatedAt: new Date() })
      .where(and(eq(documents.id, document.id), eq(documents.processingToken, token)));
  } catch (error) {
    await db.update(documents).set({ status: "failed", processingToken: null, updatedAt: new Date(),
      error: error instanceof DocumentError ? error.message : "The file could not be read. It may be damaged or unsupported. Retry, or export a new PDF or DOCX." })
      .where(and(eq(documents.id, document.id), eq(documents.processingToken, token)));
  }
  return getDocument(db, document.id);
}

export async function uploadDocument(db: Database, filename: string, buffer: Buffer) {
  const fileType = validateUpload(filename, buffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const name = filename.replaceAll("\\", "/").split("/").pop()!.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 240);
  const storageKey = randomUUID();
  const processingToken = randomUUID();
  await saveOriginal(storageKey, buffer);
  let document: typeof documents.$inferSelect | undefined;
  try {
    [document] = await db.insert(documents).values({ name, fileType, sha256, storageKey,
      byteSize: buffer.length, status: "processing", processingToken })
      .onConflictDoNothing({ target: documents.sha256 }).returning();
  } catch (error) {
    await removeOriginal(storageKey);
    throw error;
  }
  if (!document) {
    await removeOriginal(storageKey);
    const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.sha256, sha256));
    return { document: await getDocument(db, existing.id), duplicate: true };
  }
  return { document: await processDocument(db, document, processingToken, buffer), duplicate: false };
}

export async function deleteDocument(db: Database, id: string) {
  const [document] = await db.select({ id: documents.id, status: documents.status, storageKey: documents.storageKey })
    .from(documents).where(eq(documents.id, id));
  if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "This document could not be found." });
  if (document.status === "processing") throw new TRPCError({ code: "CONFLICT", message: "This document is still processing. Wait for it to finish, then delete it." });
  // Evidence keeps provenance for reviewed preferences; the FK is restrict, so refuse up front with a clear message.
  const [cited] = await db.select({ preferences: count(evidence.id) }).from(evidence).where(eq(evidence.documentId, id));
  const citedMessage = "Preferences cite this document as evidence, so it can't be deleted.";
  if (cited.preferences > 0) throw new TRPCError({ code: "CONFLICT", message: citedMessage });
  try {
    await db.delete(documents).where(eq(documents.id, id));
  } catch (error) {
    // Evidence inserted between the check and the delete.
    if (error instanceof Error && "code" in error && error.code === "23503") throw new TRPCError({ code: "CONFLICT", message: citedMessage });
    throw error;
  }
  if (document.storageKey) await removeOriginal(document.storageKey).catch(() => undefined);
  return { id };
}

export async function retryDocument(db: Database, id: string) {
  const processingToken = randomUUID();
  const [document] = await db.update(documents).set({ status: "processing", error: null, processingToken, updatedAt: new Date() })
    .where(and(eq(documents.id, id), eq(documents.status, "failed"))).returning();
  if (!document) throw new TRPCError({ code: "CONFLICT", message: "This document is already processing or ready. Refresh the list to see its status." });
  return processDocument(db, document, processingToken);
}
