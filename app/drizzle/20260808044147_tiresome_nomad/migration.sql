CREATE TABLE "admin_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(50) NOT NULL UNIQUE,
	"slug" varchar(50) NOT NULL UNIQUE,
	"permissions" jsonb DEFAULT '[]' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" varchar(50) NOT NULL UNIQUE,
	"email" varchar(255) NOT NULL UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"avatar" varchar(500),
	"admin_role_ids" jsonb DEFAULT '[]' NOT NULL,
	"is_root" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "captcha_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"type" varchar(20) NOT NULL,
	"target" varchar(255) NOT NULL,
	"code" varchar(10) NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"expired_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(50) NOT NULL UNIQUE,
	"slug" varchar(50) NOT NULL UNIQUE,
	"permissions" jsonb DEFAULT '[]' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" varchar(50) NOT NULL UNIQUE,
	"email" varchar(255) NOT NULL UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"avatar" varchar(500),
	"client_role_ids" jsonb DEFAULT '[]' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"locale" varchar(10) NOT NULL,
	"value" text NOT NULL,
	"value_type" varchar(20) DEFAULT 'text' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ct_entity_field_locale" UNIQUE("entity_type","entity_id","field_name","locale")
);
--> statement-breakpoint
CREATE TABLE "dict" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL UNIQUE,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dict_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"dict_slug" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"value" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"extra_type" varchar(20),
	"extra" text,
	"color" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sha256" varchar(64) NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"stored_name" varchar(500) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" bigint NOT NULL,
	"path" varchar(1000) NOT NULL,
	"status" varchar(20) DEFAULT 'temp' NOT NULL,
	"expired_at" timestamp with time zone,
	"created_by_type" varchar(20),
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"recipient_type" varchar(20) NOT NULL,
	"recipient_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"type" varchar(50) DEFAULT 'system' NOT NULL,
	"status" varchar(20) DEFAULT 'unread' NOT NULL,
	"related_link" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" varchar(500) NOT NULL,
	"slug" varchar(500) NOT NULL UNIQUE,
	"description" text,
	"content" text,
	"cover_image_id" uuid,
	"external_url" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_id" uuid,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operation_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"operatorId" uuid,
	"operatorName" varchar(100) NOT NULL,
	"operatorType" varchar(20) DEFAULT 'admin' NOT NULL,
	"module" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"targetType" varchar(50) NOT NULL,
	"targetId" varchar(500),
	"targetName" varchar(500),
	"detail" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" varchar(100) NOT NULL UNIQUE,
	"value" text NOT NULL,
	"client_visible" boolean DEFAULT false NOT NULL,
	"value_type" varchar(20),
	"group_name" varchar(50),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "track_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"time" timestamp with time zone NOT NULL,
	"user_id" uuid,
	"session_id" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"properties" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_event_meta" (
	"name" varchar(100) PRIMARY KEY,
	"label" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"is_preset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_property_meta" (
	"key" varchar(100) PRIMARY KEY,
	"label" varchar(100) NOT NULL,
	"data_type" varchar(20) DEFAULT 'string' NOT NULL,
	"description" text,
	"is_preset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ui_translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"locale" varchar(10) NOT NULL,
	"key" varchar(300) NOT NULL,
	"value" text NOT NULL,
	"value_type" varchar(20) DEFAULT 'input' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ui_trans_locale_key" UNIQUE("locale","key")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_admin_user_single_root" ON "admin_user" ("is_root") WHERE "is_root" = true;--> statement-breakpoint
CREATE INDEX "idx_captcha_target_type" ON "captcha_code" ("target","type");--> statement-breakpoint
CREATE INDEX "idx_ct_entity_locale" ON "content_translation" ("entity_type","entity_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dict_item_dict_slug_value" ON "dict_item" ("dict_slug","value");--> statement-breakpoint
CREATE INDEX "idx_file_sha256" ON "file" ("sha256");--> statement-breakpoint
CREATE INDEX "idx_message_recipient" ON "message" ("recipient_type","recipient_id");--> statement-breakpoint
CREATE INDEX "idx_news_created_at" ON "news" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_operation_log_module" ON "operation_log" ("module");--> statement-breakpoint
CREATE INDEX "idx_operation_log_operator" ON "operation_log" ("operatorId");--> statement-breakpoint
CREATE INDEX "idx_operation_log_created_at" ON "operation_log" ("createdAt");--> statement-breakpoint
CREATE INDEX "idx_system_config_group" ON "system_config" ("group_name");--> statement-breakpoint
CREATE INDEX "idx_track_event_time" ON "track_event" ("time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_track_event_name_time" ON "track_event" ("name","time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_track_event_user_id" ON "track_event" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_track_event_session_id" ON "track_event" ("session_id");--> statement-breakpoint
CREATE INDEX "idx_track_event_created_at" ON "track_event" ("created_at");--> statement-breakpoint
ALTER TABLE "dict_item" ADD CONSTRAINT "dict_item_dict_slug_dict_slug_fkey" FOREIGN KEY ("dict_slug") REFERENCES "dict"("slug") ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_cover_image_id_file_id_fkey" FOREIGN KEY ("cover_image_id") REFERENCES "file"("id");--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_created_by_id_admin_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_user"("id");--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_updated_by_id_admin_user_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_user"("id");