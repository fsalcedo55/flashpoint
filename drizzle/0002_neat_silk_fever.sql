CREATE TYPE "public"."analysis_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"sources" jsonb NOT NULL,
	"status" "analysis_status" DEFAULT 'running' NOT NULL,
	"attempt_token" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"suggestion_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "analyses_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "rule_key" text;--> statement-breakpoint
ALTER TABLE "preferences" ADD COLUMN "analysis_id" uuid;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_rule_key_unique" UNIQUE("rule_key");