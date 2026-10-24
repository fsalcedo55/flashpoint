import { z } from "zod";

// Purpose describes the work product, independently of its PDF/DOCX/PPTX format.
export const preferencePurposeSchema = z.enum(["questionnaire", "research_report", "research_plan"]);
export const documentPurposeSchema = z.enum([...preferencePurposeSchema.options, "other", "uncertain"]);
export type DocumentPurpose = z.infer<typeof documentPurposeSchema>;
export type PreferencePurpose = z.infer<typeof preferencePurposeSchema>;

export const documentPurposeLabels: Record<DocumentPurpose, string> = {
  questionnaire: "Questionnaire",
  research_report: "Research report",
  research_plan: "Research plan / SOW",
  other: "Other document",
  uncertain: "Uncertain type",
};

export type DocumentClassification = {
  documentId: string;
  purpose: DocumentPurpose;
  rationale: string;
  evidence: { location: string; quote: string }[];
};

export const purposeCategories: Record<PreferencePurpose, readonly string[]> = {
  questionnaire: ["Question order", "Answer formats", "Tone & language", "Survey structure"],
  research_report: ["Report structure", "Tone & language"],
  research_plan: ["Scope & deliverables", "Research approach", "Project planning", "Tone & language"],
};
