import { z } from "zod";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 10;
export type DocumentType = "pdf" | "docx" | "pptx";
export const imageDataUrlSchema = z.string().max(350_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/);
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

export const sectionLabels: Record<DocumentType, string> = { pdf: "pages", docx: "sections", pptx: "slides" };

export function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
