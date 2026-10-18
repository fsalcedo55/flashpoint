import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { strToU8, zipSync } from "fflate";
import { MAX_FILE_BYTES } from "../src/lib/documents";
import { createDatabase } from "../src/server/db";
import { documents, evidence, preferences } from "../src/server/db/schema";
import { DocumentError } from "../src/server/document-extraction";
import { readOriginal } from "../src/server/document-storage";
import { readUpload } from "../src/server/document-upload";
import { uploadDocument } from "../src/server/documents";
import { appRouter } from "../src/server/router";
import { docxFixture, pdfFixture } from "./document-fixtures";

loadEnvConfig(process.cwd());

test("document ingestion preserves originals, references, and recoverable processing states", async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const originalUploadDir = process.env.UPLOAD_DIR;
  const directory = await mkdtemp(path.join(tmpdir(), "flashpoint-documents-test-"));
  process.env.UPLOAD_DIR = directory;
  const url = new URL(process.env.DATABASE_URL);
  const name = "flashpoint_test_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 });
  let database: ReturnType<typeof createDatabase> | undefined;
  await admin.query(`CREATE DATABASE "${name}"`);
  try {
    url.pathname = "/" + name;
    database = createDatabase(url.toString());
    const { db } = database;
    await migrate(db, { migrationsFolder: "./drizzle" });
    const caller = appRouter.createCaller({ db });
    const pdf = await pdfFixture(["Brand tracker\n1. Which brands come to mind?", "2. Rate your satisfaction from 1 to 5."]);
    const word = docxFixture(["Customer research", "Which brands have you heard of?", "<script>Untrusted text stays text.</script>"]);
    let pdfId = "";

    await t.test("PDF pages and DOCX paragraphs retain exact source references and originals", async () => {
      assert.deepEqual(await caller.documents.list(), []);
      const uploaded = await uploadDocument(db, "../Brand tracker.pdf", pdf);
      pdfId = uploaded.document.id;
      assert.equal(uploaded.document.name, "Brand tracker.pdf");
      assert.equal(uploaded.document.status, "ready");
      assert.deepEqual(uploaded.document.sections.map((section) => section.location), ["Page 1", "Page 2"]);
      assert.match(uploaded.document.sections[1].text, /Rate your satisfaction/);
      const docx = await uploadDocument(db, "Research.docx", word);
      assert.equal(docx.document.status, "ready");
      assert.equal(docx.document.sections[2].location, "Paragraph 3");
      assert.equal(docx.document.sections[2].text, "<script>Untrusted text stays text.</script>");
      const [row] = await db.select().from(documents).where(eq(documents.id, pdfId));
      assert.deepEqual(await readOriginal(row.storageKey!), pdf);
      assert.equal((await caller.documents.list()).length, 2);
      assert.equal((await readdir(directory)).length, 2);
    });

    await t.test("concurrent identical uploads reuse one record and one original", async () => {
      const results = await Promise.all([uploadDocument(db, "renamed.pdf", pdf), uploadDocument(db, "copy.pdf", pdf)]);
      assert.ok(results.every((result) => result.duplicate && result.document.id === pdfId));
      assert.equal((await caller.documents.list()).length, 2);
      assert.equal((await readdir(directory)).length, 2);
    });

    await t.test("invalid type and size never create records or originals", async () => {
      for (const [filename, buffer] of [["a.exe", pdf], ["fake.pdf", word], ["empty.pdf", Buffer.alloc(0)], ["large.pdf", Buffer.alloc(MAX_FILE_BYTES + 1)]] as const) {
        await assert.rejects(uploadDocument(db, filename, buffer), DocumentError);
      }
      assert.equal((await caller.documents.list()).length, 2);
      assert.equal((await readdir(directory)).length, 2);
    });

    await t.test("unreadable files remain failed; partially blank PDFs retain page positions and warnings", async () => {
      const corrupt = await uploadDocument(db, "Damaged.pdf", Buffer.from("%PDF-1.7\ninvalid document"));
      assert.equal(corrupt.document.status, "failed");
      assert.match(corrupt.document.error!, /could not be read/);
      const blank = await uploadDocument(db, "Scanned.pdf", await pdfFixture([""]));
      assert.equal(blank.document.status, "failed");
      assert.match(blank.document.error!, /No readable text/);
      const mixed = await uploadDocument(db, "Mixed.pdf", await pdfFixture(["First page", "", "Third page"]));
      assert.equal(mixed.document.status, "ready");
      assert.equal(mixed.document.sections[1].text, "");
      assert.equal(mixed.document.sections[2].location, "Page 3");
      assert.match(mixed.document.warnings[0], /1 of 3 pages/);
      const long = await uploadDocument(db, "Long.pdf", await pdfFixture(Array.from({ length: 201 }, () => "")));
      assert.equal(long.document.status, "failed");
      assert.match(long.document.error!, /200 pages/);
    });

    await t.test("DOCX content and expansion limits fail explicitly instead of truncating text", async () => {
      const notWord = await uploadDocument(db, "Archive.docx", Buffer.from(zipSync({ "file.txt": strToU8("Not a Word document") })));
      assert.equal(notWord.document.status, "failed");
      assert.match(notWord.document.error!, /not a valid Word/);
      const largeText = await uploadDocument(db, "Long.docx", docxFixture(["x".repeat(500_001)]));
      assert.equal(largeText.document.status, "failed");
      assert.match(largeText.document.error!, /500,000 characters/);
      const manyParagraphs = await uploadDocument(db, "Many paragraphs.docx", docxFixture(Array.from({ length: 5001 }, () => "Text")));
      assert.equal(manyParagraphs.document.status, "failed");
      assert.match(manyParagraphs.document.error!, /5,000 paragraphs/);
      const compressed = Buffer.from(zipSync({ "word/document.xml": new Uint8Array(51 * 1024 * 1024) }));
      const expanded = await uploadDocument(db, "Expanded.docx", compressed);
      assert.equal(expanded.document.status, "failed");
      assert.match(expanded.document.error!, /expands beyond/);
    });

    await t.test("interrupted processing is recoverable and a missing original gives an actionable error", async () => {
      await db.update(documents).set({ status: "processing", processingToken: randomUUID(), updatedAt: new Date(Date.now() - 180_000) }).where(eq(documents.id, pdfId));
      const stale = (await caller.documents.list()).find((item) => item.id === pdfId)!;
      assert.equal(stale.status, "failed");
      assert.match(stale.error!, /interrupted/);
      const [row] = await db.select().from(documents).where(eq(documents.id, pdfId));
      assert.equal(row.processingToken, null);
      const original = path.join(directory, row.storageKey!);
      await rename(original, original + ".backup");
      const missing = await caller.documents.retry({ id: pdfId });
      assert.equal(missing.status, "failed");
      assert.match(missing.error!, /original file is missing/);
      await rename(original + ".backup", original);
      const attempts = await Promise.allSettled([caller.documents.retry({ id: pdfId }), caller.documents.retry({ id: pdfId })]);
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      assert.ok(attempts.some((attempt) => attempt.status === "rejected" && attempt.reason instanceof TRPCError && attempt.reason.code === "CONFLICT"));
      assert.equal((await caller.documents.get({ id: pdfId })).status, "ready");
    });

    await t.test("multipart requests enforce one file and the server size limit", async () => {
      const server = createServer(async (request, response) => {
        try {
          const file = await readUpload(request);
          const result = await uploadDocument(db, file.name, file.buffer);
          response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: result.document.id }));
        } catch {
          response.writeHead(400).end("Upload rejected");
        }
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const endpoint = `http://127.0.0.1:${address.port}`;
      const send = async (buffers: Buffer[]) => {
        const body = new FormData();
        buffers.forEach((buffer) => body.append("file", new Blob([new Uint8Array(buffer)]), "Survey.pdf"));
        return fetch(endpoint, { method: "POST", body });
      };
      try {
        const valid = await send([pdf]);
        assert.equal(valid.status, 200);
        assert.deepEqual(await valid.json(), { id: pdfId });
        for (const buffers of [[], [pdf, pdf], [Buffer.alloc(MAX_FILE_BYTES + 1)], [Buffer.alloc(0)]]) {
          const response = await send(buffers);
          assert.equal(response.status, 400);
          await response.text();
        }
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    });

    await t.test("fresh database connections recover extracted content and original bytes", async () => {
      const before = await caller.documents.get({ id: pdfId });
      await database!.pool.end();
      database = createDatabase(url.toString());
      const freshCaller = appRouter.createCaller({ db: database.db });
      assert.deepEqual(await freshCaller.documents.get({ id: pdfId }), before);
      const [row] = await database.db.select().from(documents).where(eq(documents.id, pdfId));
      assert.deepEqual(await readOriginal(row.storageKey!), pdf);
    });

    await t.test("deleting removes the record and original, but never a document cited as evidence", async () => {
      const { db } = database!;
      const freshCaller = appRouter.createCaller({ db });
      const extra = await uploadDocument(db, "Extra.pdf", await pdfFixture(["A third questionnaire."]));
      const [extraRow] = await db.select().from(documents).where(eq(documents.id, extra.document.id));
      const before = (await freshCaller.documents.list()).length;
      await assert.rejects(freshCaller.documents.delete({ id: randomUUID() }), (error: TRPCError) => error.code === "NOT_FOUND");
      // Cite the PDF from a preference, then try to delete it.
      const rule = "Open brand sections with an unaided recall question.";
      const [pref] = await db.insert(preferences).values({ category: "Question order", title: "Ask unaided first", suggestedRule: rule, rule, rationale: "Test fixture." }).returning({ id: preferences.id });
      await db.insert(evidence).values({ preferenceId: pref.id, documentId: pdfId, location: "Page 1", quote: "Brand tracker" });
      await assert.rejects(freshCaller.documents.delete({ id: pdfId }), (error: TRPCError) => error.code === "CONFLICT" && /cite/.test(error.message));
      assert.equal((await freshCaller.documents.list()).length, before);
      await db.delete(evidence).where(eq(evidence.documentId, pdfId));
      assert.deepEqual(await freshCaller.documents.delete({ id: extra.document.id }), { id: extra.document.id });
      assert.equal((await freshCaller.documents.list()).length, before - 1);
      await assert.rejects(readOriginal(extraRow.storageKey!));
    });
  } finally {
    await database?.pool.end();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
    await rm(directory, { recursive: true, force: true });
  }
});
