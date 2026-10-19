import type { NextApiRequest, NextApiResponse } from "next";
import { DocumentError, extractDocument, validateUpload } from "@/server/services/document-extraction";
import { readUpload } from "@/server/services/document-upload";

export const config = { api: { bodyParser: false }, maxDuration: 120 };
export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to upload a document." });
  }
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
    return response.status(403).json({ error: "Upload documents from this app." });
  }
  try {
    const { name, buffer } = await readUpload(request);
    const fileType = validateUpload(name, buffer);
    return response.status(200).json({ fileType, ...await extractDocument(buffer, fileType) });
  } catch (error) {
    return response.status(400).json({ error: error instanceof DocumentError
      ? error.message : "This document could not be read. Export a new PDF or DOCX and try again." });
  }
}
