import type { PreferencePurpose } from "./document-purpose";

export const preferenceStatuses = ["pending", "confirmed", "denied"] as const;
export type PreferenceStatus = (typeof preferenceStatuses)[number];

export type Preference = {
  id: string;
  analysisId: string;
  purpose: PreferencePurpose;
  category: string;
  title: string;
  suggestedRule: string;
  rule: string;
  rationale: string;
  status: PreferenceStatus;
  evidence: { documentId: string; document: string; location: string; quote: string; kind?: "image" }[];
};
