import mammoth from "mammoth";
import { zipSync } from "fflate";
import { documentTypeFromName, formatFileSize, MAX_FILE_BYTES, type DocumentSection, type DocumentType } from "../../lib/documents";
import { preserveDocxNumbering } from "./docx-numbering";
import { groupQuestionSections } from "./questionnaire-sections";
import { DocumentError } from "./document-error";
import { readOfficeArchive } from "./office-archive";
import { extractPptx } from "./pptx-extraction";

export { DocumentError } from "./document-error";

const MAX_CHARACTERS = 500_000;
const MAX_PAGES = 200;

export function validateUpload(name: string, buffer: Buffer): DocumentType {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new DocumentError(`Files must be nonempty and no larger than ${formatFileSize(MAX_FILE_BYTES)}.`);
  }
  const extension = documentTypeFromName(name);
  if (extension === "pdf" && buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) return "pdf";
  if ((extension === "docx" || extension === "pptx") && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return extension;
  throw new DocumentError("Choose a PDF, DOCX or PPTX file whose contents match its extension.");
}

function cleanText(text: string, trim = true) {
  const normalized = text.replaceAll("\u0000", "").replace(/\r\n?/g, "\n");
  return trim ? normalized.trim() : normalized;
}

// Mammoth's documented transform API exposes paragraphs and table cells before
// HTML generation. Only text enters the app; images/links are never rendered.
type WordElement = { type: string; value?: string; children?: WordElement[]; styleName?: string; colSpan?: number; rowSpan?: number };

export async function extractDocument(buffer: Buffer, type: DocumentType) {
  const sections: DocumentSection[] = [];
  const warnings: string[] = [];
  let assets: Record<string, string> | undefined;
  let slideCount: number | undefined;
  let characterCount = 0;
  function addSection(location: string, raw: string, table = false, metadata: Pick<DocumentSection, "kind" | "imageId"> = {}) {
    if (sections.length >= 5000) throw new DocumentError("This document contains more than 5,000 content sections. Split it into smaller files.");
    const text = cleanText(raw, !table);
    characterCount += text.length;
    if (characterCount > MAX_CHARACTERS) throw new DocumentError("This document contains more than 500,000 characters. Split it into smaller files.");
    sections.push({ location, text, ...metadata });
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
  } else if (type === "pptx") {
    const result = await extractPptx(await readOfficeArchive(buffer, "pptx"));
    for (const { location, text, ...metadata } of result.sections) addSection(location, text, true, metadata);
    warnings.push(...result.warnings);
    assets = result.assets;
    slideCount = result.slideCount;
  } else {
    const files = await readOfficeArchive(buffer, "docx");
    warnings.push(...preserveDocxNumbering(files));
    let paragraph = 0, table = 0;
    const headings = new Set<string>();
    const textOf = (node: WordElement): string => {
      if (node.type === "text") return node.value ?? "";
      if (node.type === "tab") return "\t";
      if (node.type === "break") return "\n";
      if (node.type === "paragraph" && ++paragraph > 5000) throw new DocumentError("This document contains more than 5,000 paragraphs. Split it into smaller files.");
      if ((node.colSpan ?? 1) > 1 || (node.rowSpan ?? 1) > 1) {
        if (!warnings.includes("Merged table cells require checking against the original; do not infer column relationships from flattened cells.")) warnings.push("Merged table cells require checking against the original; do not infer column relationships from flattened cells.");
      }
      const separator = node.type === "tableRow" ? "\t" : ["table", "tableCell"].includes(node.type) ? "\n" : "";
      return (node.children ?? []).map(textOf).join(separator);
    };
    const visit = (node: WordElement) => {
      if (node.type === "paragraph" || node.type === "table") {
        const text = textOf(node);
        const location = node.type === "table" ? `Table ${++table}` : `Paragraph ${paragraph}`;
        if (/^(Heading|Title|Subtitle)/i.test(node.styleName ?? "")) headings.add(location);
        if (cleanText(text)) addSection(location, text, node.type === "table");
      } else node.children?.forEach(visit);
    };
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(zipSync(files)) }, {
      externalFileAccess: false, includeEmbeddedStyleMap: false,
      transformDocument(document: WordElement) { visit(document); return { ...document, children: [] }; },
    });
    const grouped = groupQuestionSections(sections.map((section) => ({ ...section, heading: headings.has(section.location) })));
    sections.splice(0, sections.length, ...grouped);
    characterCount = sections.reduce((total, section) => total + section.text.length, 0);
    if (characterCount > MAX_CHARACTERS) throw new DocumentError("This document contains more than 500,000 characters. Split it into smaller files.");
    if (result.messages.length) warnings.push("Some document elements could not be read. Compare the extracted text with the original.");
  }

  if (!characterCount) throw new DocumentError("No readable text was found. Upload a PDF, DOCX or PPTX with selectable text; images and scanned pages need OCR first.");
  const result = { sections, warnings, characterCount, sectionCount: slideCount ?? sections.length, ...(assets && Object.keys(assets).length ? { assets } : {}) };
  if (Buffer.byteLength(JSON.stringify(result)) > 3_500_000) throw new DocumentError("The extracted content is too large for one upload. Split this document into smaller files.");
  return result;
}
