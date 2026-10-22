import assert from "node:assert/strict";
import fs, { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import type { NextApiRequest, NextApiResponse } from "next";
import { MAX_FILE_BYTES } from "../src/lib/documents";
import { DocumentError, extractDocument, validateUpload } from "../src/server/services/document-extraction";
import uploadHandler from "../src/pages/api/documents/upload";
import { docxFixture, docxXmlFixture, pdfFixture } from "./document-fixtures";
import { pptxFixture } from "./pptx-fixtures";

async function extract(name: string, buffer: Buffer) { return extractDocument(buffer, validateUpload(name, buffer)); }

test("PDF/DOCX extraction preserves references and keeps embedded markup as plain text", async () => {
  const pdf = await extract("Survey.pdf", await pdfFixture(["First page", "Second page"]));
  assert.deepEqual(pdf.sections.map((item) => item.location), ["Page 1", "Page 2"]);
  const docx = await extract("Survey.docx", docxFixture(["Question one", "<script>Untrusted text</script>"]));
  assert.equal(docx.sections[1].location, "Paragraph 2");
  assert.equal(docx.sections[1].text, "<script>Untrusted text</script>");
});

test("invalid, empty and oversized files are rejected", async () => {
  const pdf = await pdfFixture(["Question"]);
  for (const [name, buffer] of [["a.exe", pdf], ["fake.pdf", docxFixture(["Question"])], ["empty.pdf", Buffer.alloc(0)], ["large.pdf", Buffer.alloc(MAX_FILE_BYTES + 1)]] as const) {
    assert.throws(() => validateUpload(name, buffer), DocumentError);
  }
});

test("damaged and unreadable PDFs fail; blank pages retain their position", async () => {
  await assert.rejects(extract("Damaged.pdf", Buffer.from("%PDF-1.7\ninvalid document")));
  await assert.rejects(extract("Scanned.pdf", await pdfFixture([""])), /No readable text/);
  const mixed = await extract("Mixed.pdf", await pdfFixture(["First", "", "Third"]));
  assert.equal(mixed.sections[1].text, "");
  assert.equal(mixed.sections[2].location, "Page 3");
  assert.match(mixed.warnings[0], /1 of 3 pages/);
  await assert.rejects(extract("Long.pdf", await pdfFixture(Array.from({ length: 201 }, () => ""))), /200 pages/);
});

test("DOCX expansion, paragraph and text limits are enforced", async () => {
  await assert.rejects(extract("Archive.docx", Buffer.from(zipSync({ "file.txt": strToU8("Not Word") }))), /not a valid Word/);
  await assert.rejects(extract("Long.docx", docxFixture(["x".repeat(500_001)])), /500,000 characters/);
  await assert.rejects(extract("Many.docx", docxFixture(Array.from({ length: 5001 }, () => "Text"))), /5,000 paragraphs/);
  await assert.rejects(extract("Expanded.docx", Buffer.from(zipSync({ "word/document.xml": new Uint8Array(51 * 1024 * 1024) }))), /expands beyond/);
});

test("all 58 realistic questionnaire prompts survive extraction", async () => {
  const root = new URL("./fixtures/questionnaires/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8")) as { file: string; questions: { id: string; prompt: string }[] }[];
  let count = 0;
  for (const fixture of manifest) {
    const result = await extract(fixture.file, await readFile(new URL(fixture.file, root)));
    const text = result.sections.map((section) => section.text).join("\n");
    for (const question of fixture.questions) { assert.ok(text.includes(`${question.id}. ${question.prompt}`)); count++; }
    assert.deepEqual(result.warnings, []);
  }
  assert.equal(count, 58);
});

test("upload API enforces bounds, logs unexpected failures and removes temporary files", async (t) => {
  const before = (await readdir(tmpdir())).filter((name) => name.startsWith("flashpoint-upload-"));
  const pdf = await pdfFixture(["Question"]);
  const errors = t.mock.method(console, "error", () => {});
  const server = createServer(async (request, response) => {
    const apiResponse = Object.assign(response, {
      status(code: number) { response.statusCode = code; return apiResponse; },
      json(body: unknown) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(body)); },
    });
    await uploadHandler(request as NextApiRequest, apiResponse as NextApiResponse);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const send = async (buffers: Buffer[], name = "Survey.pdf") => {
    const body = new FormData();
    buffers.forEach((buffer) => body.append("file", new Blob([new Uint8Array(buffer)]), name));
    return fetch(`http://127.0.0.1:${address.port}`, { method: "POST", body });
  };
  try {
    const response = await send([pdf]);
    assert.equal(response.status, 200); assert.equal((await response.json()).sectionCount, 1);
    const presentation = await send([pptxFixture([{ paragraphs: ["Report findings"] }])], "Report.pptx");
    assert.equal(presentation.status, 200);
    const extracted = await presentation.json();
    assert.equal(extracted.fileType, "pptx");
    assert.deepEqual(extracted.sections, [{ location: "Slide 1", text: "Report findings" }]);
    for (const buffers of [[], [pdf, pdf], [Buffer.alloc(MAX_FILE_BYTES + 1)], [Buffer.alloc(0)]]) {
      const rejected = await send(buffers); assert.equal(rejected.status, 400); await rejected.text();
    }
    for (const xml of ['<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>', '<numbering value="unterminated></numbering>']) {
      const rejected = await send([docxXmlFixture("<w:p><w:r><w:t>Q1. Example</w:t></w:r></w:p>", { "word/numbering.xml": xml })], "Invalid.docx");
      assert.equal(rejected.status, 400);
      assert.match((await rejected.json()).error, /DOCX XML.*Export a new DOCX/);
    }
    assert.equal(errors.mock.callCount(), 0);

    const diskFailure = t.mock.method(fs, "readFile", async () => {
      throw Object.assign(new Error("private document contents and server path"), { code: "EIO" });
    });
    try {
      const failed = await send([pdf]);
      assert.equal(failed.status, 500);
      assert.deepEqual(await failed.json(), { error: "This document could not be read. Export a new PDF, DOCX or PPTX and try again." });
      assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [
        ["[document-upload] Unexpected upload failure", { name: "Error", code: "EIO" }],
      ]);
    } finally { diskFailure.mock.restore(); }
    assert.deepEqual((await readdir(tmpdir())).filter((name) => name.startsWith("flashpoint-upload-")).sort(), before.sort());
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
