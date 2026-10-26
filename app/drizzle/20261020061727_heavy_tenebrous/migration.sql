CREATE TABLE "model_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_type" varchar(20) NOT NULL,
	"account_id" uuid NOT NULL,
	"device_id" uuid,
	"model" varchar(120) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"latency_ms" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"error_message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_model_usage_created_at" ON "model_usage" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_model_usage_account" ON "model_usage" ("account_id");