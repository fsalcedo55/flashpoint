import mammoth from "mammoth";
import { fromBufferPromise } from "yauzl";
import { MAX_FILE_BYTES, type DocumentSection, type DocumentType } from "../lib/documents";

const MAX_CHARACTERS = 500_000;
const MAX_PAGES = 200;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;

export class DocumentError extends Error {}

export function validateUpload(name: string, buffer: Buffer): DocumentType {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new DocumentError("Files must be nonempty and no larger than 10 MB.");
  }
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf" && buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) return "pdf";
  if (extension === "docx" && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "docx";
  throw new DocumentError("Choose a PDF or DOCX file whose contents match its extension.");
}

function cleanText(text: string) {
  return text.replaceAll("\u0000", "").replace(/\r\n?/g, "\n").trim();
}

// Validate the archive and actual expanded sizes before handing it to the DOCX reader.
// Nothing is extracted to disk, and referenced external files are never opened.
async function validateDocx(buffer: Buffer) {
  const zip = await fromBufferPromise(buffer, { validateEntrySizes: true, strictFileNames: true });
  let expanded = 0;
  let entries = 0;
  let hasDocument = false;
  for await (const entry of zip.eachEntry()) {
    entries += 1;
    if (entries > 2000 || expanded + entry.uncompressedSize > MAX_EXPANDED_BYTES) {
      throw new DocumentError("This DOCX expands beyond the processing limit. Upload a smaller document.");
    }
    if (entry.isEncrypted()) throw new DocumentError("Password-protected documents are not supported. Upload an unlocked copy.");
    if (entry.fileName === "word/document.xml") hasDocument = true;
    const stream = await zip.openReadStreamPromise(entry);
    for await (const chunk of stream) {
      expanded += chunk.length;
      if (expanded > MAX_EXPANDED_BYTES) {
        throw new DocumentError("This DOCX expands beyond the processing limit. Upload a smaller document.");
      }
    }
  }
  if (!hasDocument) throw new DocumentError("This file is not a valid Word document. Export it as DOCX and upload it again.");
}

export async function extractDocument(buffer: Buffer, type: DocumentType) {
  const sections: DocumentSection[] = [];
  const warnings: string[] = [];
  let characterCount = 0;
  function addSection(location: string, raw: string) {
    if (sections.length >= 5000) throw new DocumentError("This document contains more than 5,000 paragraphs. Split it into smaller files.");
    const text = cleanText(raw);
    characterCount += text.length;
    if (characterCount > MAX_CHARACTERS) throw new DocumentError("This document contains more than 500,000 characters. Split it into smaller files.");
    sections.push({ location, text });
  }

  if (type === "pdf") {
    // Load the Node-only parser on demand; it must never enter the client bundle.
    const { PDFParse, PasswordException } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer, isEvalSupported: false, useWorkerFetch: false, verbosity: 0 });
    try {
      const info = await parser.getInfo();
      if (info.total > MAX_PAGES) throw new DocumentError("PDFs are limited to 200 pages. Split this document into smaller files.");
      for (let page = 1; page <= info.total; page += 1) {
        const result = await parser.getText({ partial: [page] });
        addSection("Page " + page, result.pages[0]?.text ?? "");
      }
      const empty = sections.filter((section) => !section.text).length;
      if (empty) warnings.push(`${empty} of ${info.total} pages have no readable text. Blank or scanned pages require checking against the original; OCR is not included.`);
    } catch (error) {
      if (error instanceof PasswordException) throw new DocumentError("Password-protected PDFs are not supported. Upload an unlocked copy.");
      throw error;
    } finally {
      await parser.destroy();
    }
  } else {
    await validateDocx(buffer);
    const result = await mammoth.extractRawText({ buffer });
    // Keep source paragraph numbering, including gaps from empty paragraphs.
    result.value.split("\n\n").forEach((paragraph, index) => {
      if (cleanText(paragraph)) addSection("Paragraph " + (index + 1), paragraph);
    });
    if (result.messages.length) warnings.push("Some document elements could not be read. Compare the extracted text with the original.");
  }

  if (!characterCount) throw new DocumentError("No readable text was found. Upload a text-based PDF or DOCX; scanned documents need OCR first.");
  return { sections, warnings, characterCount, sectionCount: sections.length };
}
