CREATE TYPE "public"."document_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "byte_size" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "storage_key" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "status" "document_status" DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "section_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "character_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processing_token" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_storage_key_unique" UNIQUE("storage_key");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_sha256_unique" UNIQUE("sha256");