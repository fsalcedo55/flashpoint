import { z } from "zod";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 10;
export type DocumentType = "pdf" | "docx";
export type DocumentSection = { location: string; text: string };
export const extractedDocumentSchema = z.object({
  fileType: z.enum(["pdf", "docx"]),
  sections: z.array(z.object({ location: z.string(), text: z.string() })),
  warnings: z.array(z.string()),
  characterCount: z.number(),
  sectionCount: z.number(),
});
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
export type SessionDocument = ExtractedDocument & {
  id: string;
  name: string;
  byteSize: number;
  file: File;
  url: string;
  sha256?: string;
  status: "processing" | "ready" | "failed";
  error?: string;
};

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
