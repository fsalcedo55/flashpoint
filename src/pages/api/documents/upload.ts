import type { NextApiRequest, NextApiResponse } from "next";
import { getDatabase } from "@/server/db";
import { DocumentError } from "@/server/document-extraction";
import { readUpload } from "@/server/document-upload";
import { uploadDocument } from "@/server/documents";

export const config = { api: { bodyParser: false }, maxDuration: 120 };

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to upload a document." });
  }
  // Multipart forms can otherwise write to this local workspace from other sites.
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
    return response.status(403).json({ error: "Upload documents from this app." });
  }
  try {
    const { name, buffer } = await readUpload(request);
    const result = await uploadDocument(getDatabase(), name, buffer);
    // Keep extracted content in the detail query, not in the upload response.
    return response.status(result.duplicate ? 200 : 201).json({ id: result.document.id,
      name: result.document.name, status: result.document.status, duplicate: result.duplicate });
  } catch (error) {
    return response.status(error instanceof DocumentError ? 400 : 500).json({ error: error instanceof DocumentError
      ? error.message : "The document could not be saved. Check the database and upload directory, then try again." });
  }
}
