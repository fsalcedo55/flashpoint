import { fromBufferPromise } from "yauzl";
import { DocumentError } from "./document-error";

const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;

// DOCX and PPTX are ZIP packages. Bound both declared and actual expanded sizes
// before parsing XML. Nothing is extracted to disk or fetched from external links.
export async function readOfficeArchive(buffer: Buffer, type: "docx" | "pptx") {
  const zip = await fromBufferPromise(buffer, { validateEntrySizes: true, strictFileNames: true });
  let expanded = 0;
  let entries = 0;
  const files: Record<string, Uint8Array> = Object.create(null);
  const tooLarge = () => new DocumentError(`This ${type.toUpperCase()} expands beyond the processing limit. Upload a smaller document.`);
  try {
    for await (const entry of zip.eachEntry()) {
      entries += 1;
      if (entries > 2000 || expanded + entry.uncompressedSize > MAX_EXPANDED_BYTES) throw tooLarge();
      if (entry.isEncrypted()) throw new DocumentError("Password-protected documents are not supported. Upload an unlocked copy.");
      if (Object.hasOwn(files, entry.fileName)) throw new DocumentError(`This ${type.toUpperCase()} contains duplicate archive entries.`);
      const chunks: Buffer[] = [];
      const stream = await zip.openReadStreamPromise(entry);
      for await (const chunk of stream) {
        expanded += chunk.length;
        if (expanded > MAX_EXPANDED_BYTES) throw tooLarge();
        chunks.push(chunk);
      }
      files[entry.fileName] = Buffer.concat(chunks);
    }
  } finally { zip.close(); }
  const main = type === "docx" ? "word/document.xml" : "ppt/presentation.xml";
  if (!files[main]) {
    throw new DocumentError(`This file is not a valid ${type === "docx" ? "Word document" : "PowerPoint presentation"}. Export it as ${type.toUpperCase()} and upload it again.`);
  }
  return files;
}
