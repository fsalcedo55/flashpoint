import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { preferenceStatuses } from "../../lib/preferences";
import { documentStatuses, type DocumentSection, type DocumentType } from "../../lib/documents";
import { analysisStatuses } from "../../lib/analysis";

export const preferenceStatus = pgEnum("preference_status", preferenceStatuses);
export const documentStatus = pgEnum("document_status", documentStatuses);
export const analysisStatus = pgEnum("analysis_status", analysisStatuses);

// One shared workspace for the standalone trial; no accounts or tenants yet.
export const documents = pgTable("documents", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  fileType: text("file_type").$type<DocumentType>(),
  byteSize: integer("byte_size"),
  storageKey: uuid("storage_key").unique(),
  sha256: text().unique(),
  status: documentStatus().default("ready").notNull(),
  error: text(),
  warnings: jsonb().$type<string[]>().default([]).notNull(),
  sections: jsonb().$type<DocumentSection[]>().default([]).notNull(),
  sectionCount: integer("section_count").default(0).notNull(),
  characterCount: integer("character_count").default(0).notNull(),
  processingToken: uuid("processing_token"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const analyses = pgTable("analyses", {
  id: uuid().defaultRandom().primaryKey(),
  fingerprint: text().notNull().unique(),
  sources: jsonb().$type<{ id: string; name: string }[]>().notNull(),
  status: analysisStatus().default("running").notNull(),
  attemptToken: uuid("attempt_token").notNull(),
  provider: text().notNull(),
  model: text().notNull(),
  promptVersion: text("prompt_version").notNull(),
  suggestionCount: integer("suggestion_count").default(0).notNull(),
  rejectedCount: integer("rejected_count").default(0).notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  error: text(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const preferences = pgTable("preferences", {
  id: uuid().defaultRandom().primaryKey(),
  ruleKey: text("rule_key").unique(),
  analysisId: uuid("analysis_id").references(() => analyses.id),
  category: text().notNull(),
  title: text().notNull(),
  suggestedRule: text("suggested_rule").notNull(),
  rule: text().notNull(),
  rationale: text().notNull(),
  status: preferenceStatus().default("pending").notNull(),
  position: integer().default(0).notNull(),
  version: integer().default(0).notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("preference_rule_length", sql`char_length(btrim(${table.rule})) between 10 and 500`),
  check("preference_reviewed_at", sql`(${table.status} = 'pending') = (${table.reviewedAt} is null)`),
]);

export const evidence = pgTable("preference_evidence", {
  id: uuid().defaultRandom().primaryKey(),
  preferenceId: uuid("preference_id").notNull().references(() => preferences.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
  location: text().notNull(),
  quote: text().notNull(),
  position: integer().default(0).notNull(),
}, (table) => [
  unique("evidence_source_unique").on(table.preferenceId, table.documentId, table.location),
  index("evidence_document_idx").on(table.documentId),
]);
