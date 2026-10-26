CREATE TABLE "user_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"user_type" varchar(20) NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "message" RENAME COLUMN "recipient_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "message" RENAME COLUMN "recipient_type" TO "user_type";--> statement-breakpoint
ALTER INDEX "idx_message_recipient" RENAME TO "idx_message_user";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_config_user" ON "user_config" ("user_type","user_id");