import { z } from "zod";
import type { Preference } from "./preferences";

export const MAX_ANALYSIS_DOCUMENTS = 5;
export const MAX_ANALYSIS_CHARACTERS = 80_000;
export const analysisInputSchema = z.object({
  documents: z.array(z.object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(255),
    sections: z.array(z.object({
      location: z.string().trim().min(1).max(100),
      text: z.string().max(MAX_ANALYSIS_CHARACTERS),
    })).min(1).max(5000),
  })).min(1).max(MAX_ANALYSIS_DOCUMENTS),
});
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type AnalysisResult = {
  suggestions: Omit<Preference, "analysisId">[];
  rejectedCount: number;
};
export type AnalysisRun = {
  id: string;
  key: string;
  sources: { id: string; name: string }[];
  status: "running" | "completed" | "failed";
  suggestionCount: number;
  rejectedCount: number;
  error?: string;
};
