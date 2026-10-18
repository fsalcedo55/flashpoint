CREATE TYPE "public"."preference_status" AS ENUM('pending', 'confirmed', 'denied');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sample_key" text,
	"name" text NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_sample_key_unique" UNIQUE("sample_key")
);
--> statement-breakpoint
CREATE TABLE "preference_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preference_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"location" text NOT NULL,
	"quote" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "evidence_source_unique" UNIQUE("preference_id","document_id","location")
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sample_key" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"suggested_rule" text NOT NULL,
	"rule" text NOT NULL,
	"rationale" text NOT NULL,
	"status" "preference_status" DEFAULT 'pending' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_sample_key_unique" UNIQUE("sample_key"),
	CONSTRAINT "preference_rule_length" CHECK (char_length(btrim("preferences"."rule")) between 10 and 500),
	CONSTRAINT "preference_reviewed_at" CHECK (("preferences"."status" = 'pending') = ("preferences"."reviewed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "preference_evidence" ADD CONSTRAINT "preference_evidence_preference_id_preferences_id_fk" FOREIGN KEY ("preference_id") REFERENCES "public"."preferences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_evidence" ADD CONSTRAINT "preference_evidence_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_document_idx" ON "preference_evidence" USING btree ("document_id");