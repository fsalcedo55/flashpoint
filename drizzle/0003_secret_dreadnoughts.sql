-- Sample review mode is gone. Remove its rows before dropping the columns that marked them,
-- so sample documents (which have no stored file) never surface as real uploads.
DELETE FROM "preferences" WHERE "sample_key" IS NOT NULL;--> statement-breakpoint
DELETE FROM "documents" WHERE "is_sample";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_sample_key_unique";--> statement-breakpoint
ALTER TABLE "preferences" DROP CONSTRAINT "preferences_sample_key_unique";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "sample_key";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "is_sample";--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "sample_key";