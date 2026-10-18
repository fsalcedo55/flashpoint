import type { NextApiRequest, NextApiResponse } from "next";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/server/db";
import { documents } from "@/server/db/schema";
import { readOriginal } from "@/server/document-storage";

export const config = { api: { responseLimit: "11mb" } };

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Use GET to download a document." });
  }
  const id = z.uuid().safeParse(request.query.id);
  if (!id.success) return response.status(400).json({ error: "Invalid document ID." });
  try {
    const [document] = await getDatabase().select({ name: documents.name, fileType: documents.fileType, storageKey: documents.storageKey })
      .from(documents).where(eq(documents.id, id.data));
    if (!document?.storageKey) return response.status(404).json({ error: "The original file could not be found." });
    const buffer = await readOriginal(document.storageKey).catch(() => null);
    if (!buffer) return response.status(404).json({ error: "The original file is missing from the upload directory." });
    response.setHeader("Content-Type", document.fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const filename = encodeURIComponent(document.name).replace(/['()*]/g, (character) => "%" + character.charCodeAt(0).toString(16));
    response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
    return response.status(200).send(buffer);
  } catch {
    return response.status(500).json({ error: "The original file could not be loaded. Try again." });
  }
}
