CREATE TABLE "device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_type" varchar(20) NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"platform" varchar(50),
	"client_version" varchar(50),
	"token_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_device_owner" ON "device" ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_device_token_hash" ON "device" ("token_hash");