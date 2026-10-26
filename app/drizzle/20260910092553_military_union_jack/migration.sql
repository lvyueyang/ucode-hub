ALTER TABLE "news" ADD COLUMN "is_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "news" DROP COLUMN "status";