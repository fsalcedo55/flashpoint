import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import formidable from "formidable";
import { MAX_FILE_BYTES } from "../lib/documents";
import { DocumentError } from "./document-extraction";

export async function readUpload(request: IncomingMessage) {
  if (!request.headers["content-type"]?.startsWith("multipart/form-data;")) {
    throw new DocumentError("Send a PDF or DOCX using the file upload form.");
  }
  const directory = await mkdtemp(path.join(tmpdir(), "flashpoint-upload-"));
  try {
    const form = formidable({ uploadDir: directory, maxFiles: 1, maxFileSize: MAX_FILE_BYTES,
      maxTotalFileSize: MAX_FILE_BYTES, maxFields: 0, allowEmptyFiles: false, minFileSize: 1 });
    const [, files] = await form.parse(request);
    const allFiles = Object.values(files).flat();
    const file = files.file?.[0];
    if (!file || allFiles.length !== 1) throw new DocumentError("Choose one file per upload request.");
    return { name: file.originalFilename ?? "", buffer: await readFile(file.filepath) };
  } catch (error) {
    if (error instanceof DocumentError) throw error;
    throw new DocumentError("Upload failed. Choose a nonempty PDF or DOCX no larger than 4 MB, and try again.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
