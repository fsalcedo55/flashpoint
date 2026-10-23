import { z } from "zod";
import type { DocumentClassification } from "./document-purpose";

// Decimal MB, leaving 100 KB for multipart overhead below Vercel's 4.5 MB ceiling.
export const MAX_FILE_BYTES = 4_400_000;
export const MAX_FILES = 10;
export type DocumentType = "pdf" | "docx" | "pptx";
export const imageDataUrlSchema = z.string().max(350_000)
  .regex(/^data:image\/jpeg;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/);
export const imageAssetsSchema = z.record(z.string().regex(/^image\d+$/), imageDataUrlSchema)
  .refine((assets) => Object.keys(assets).length <= 40, "Too many images.");
export const documentSectionSchema = z.object({
  location: z.string(), text: z.string(),
  kind: z.enum(["notes", "chart", "formatting", "image"]).optional(),
  imageId: z.string().regex(/^image\d+$/).optional(),
});
export type DocumentSection = z.infer<typeof documentSectionSchema>;
export const extractedDocumentSchema = z.object({
  fileType: z.enum(["pdf", "docx", "pptx"]),
  sections: z.array(documentSectionSchema),
  assets: imageAssetsSchema.optional(),
  warnings: z.array(z.string()),
  characterCount: z.number(),
  sectionCount: z.number(),
});
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
export type SessionDocument = ExtractedDocument & {
  classification?: DocumentClassification;
  id: string;
  name: string;
  byteSize: number;
  file: File;
  url: string;
  sha256?: string;
  status: "processing" | "ready" | "failed";
  error?: string;
};

export function documentTypeFromName(name: string): DocumentType | undefined {
  if (!name.includes(".")) return undefined;
  const extension = name.split(".").pop()?.toLowerCase();
  return extension === "pdf" || extension === "docx" || extension === "pptx" ? extension : undefined;
}

const sectionNames: Record<DocumentType, [one: string, other: string]> = { pdf: ["page", "pages"], docx: ["section", "sections"], pptx: ["slide", "slides"] };

export function formatSectionCount(count: number, type: DocumentType) {
  return `${count.toLocaleString()} ${sectionNames[type][count === 1 ? 0 : 1]}`;
}

export function formatFileSize(bytes: number) {
  return bytes >= 1_000_000
    ? (bytes / 1_000_000).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1000)) + " KB";
}
