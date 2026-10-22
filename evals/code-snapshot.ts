// Both runners record the complete document reader, including format-specific helpers.
export const DOCUMENT_EXTRACTION_PATHS = [
  "src/lib/documents.ts",
  "src/server/services/document-extraction.ts",
  "src/server/services/document-error.ts",
  "src/server/services/office-archive.ts",
  "src/server/services/docx-numbering.ts",
  "src/server/services/questionnaire-sections.ts",
  "src/server/services/pptx-extraction.ts",
  "src/server/services/pptx-content.ts",
  "src/server/services/pptx-formatting.ts",
  "src/server/services/pptx-xml.ts",
] as const;
