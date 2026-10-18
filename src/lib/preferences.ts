export const preferenceStatuses = ["pending", "confirmed", "denied"] as const;
export type PreferenceStatus = (typeof preferenceStatuses)[number];

export type Preference = {
  id: string;
  category: string;
  title: string;
  rule: string;
  rationale: string;
  status: PreferenceStatus;
  version: number;
  evidence: { documentId?: string; document: string; location: string; quote: string }[];
};
