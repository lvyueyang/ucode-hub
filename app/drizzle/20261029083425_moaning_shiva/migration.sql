CREATE TABLE `admin_role` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`slug` text NOT NULL UNIQUE,
	`permissions` text DEFAULT '[]' NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `admin_user` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL UNIQUE,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`password_hash` text NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`avatar` text,
	`admin_role_ids` text DEFAULT '[]' NOT NULL,
	`is_root` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `captcha_code` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`target` text NOT NULL,
	`code` text NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expired_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `client_role` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`slug` text NOT NULL UNIQUE,
	`permissions` text DEFAULT '[]' NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `client_user` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL UNIQUE,
	`email` text NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`avatar` text,
	`client_role_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `content_translation` (
	`id` text PRIMARY KEY,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_name` text NOT NULL,
	`locale` text NOT NULL,
	`value` text NOT NULL,
	`value_type` text DEFAULT 'text' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	CONSTRAINT `uq_ct_entity_field_locale` UNIQUE(`entity_type`,`entity_id`,`field_name`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `device` (
	`id` text PRIMARY KEY,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text,
	`client_version` text,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `dict` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `dict_item` (
	`id` text PRIMARY KEY,
	`dict_slug` text NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`extra_type` text,
	`extra` text,
	`color` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer,
	CONSTRAINT `fk_dict_item_dict_slug_dict_slug_fk` FOREIGN KEY (`dict_slug`) REFERENCES `dict`(`slug`) ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE `file` (
	`id` text PRIMARY KEY,
	`sha256` text NOT NULL,
	`original_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`path` text NOT NULL,
	`width` integer,
	`height` integer,
	`tags` text,
	`status` text DEFAULT 'temp' NOT NULL,
	`expired_at` integer,
	`created_by_type` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`user_type` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`type` text DEFAULT 'system' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`related_link` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `model_usage` (
	`id` text PRIMARY KEY,
	`account_type` text NOT NULL,
	`account_id` text NOT NULL,
	`device_id` text,
	`model` text NOT NULL,
	`provider_id` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`latency_ms` integer NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operation_log` (
	`id` text PRIMARY KEY,
	`request_id` text,
	`operatorId` text,
	`operatorName` text NOT NULL,
	`operatorType` text DEFAULT 'admin' NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`targetType` text NOT NULL,
	`targetId` text,
	`targetName` text,
	`detail` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`value` text NOT NULL,
	`client_visible` integer DEFAULT false NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`value_type` text,
	`group_name` text,
	`description` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `track_event` (
	`id` text PRIMARY KEY,
	`time` integer NOT NULL,
	`user_id` text,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`properties` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `track_event_meta` (
	`name` text PRIMARY KEY,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`is_preset` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `track_property_meta` (
	`key` text PRIMARY KEY,
	`label` text NOT NULL,
	`data_type` text DEFAULT 'string' NOT NULL,
	`description` text,
	`is_preset` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ui_translation` (
	`id` text PRIMARY KEY,
	`locale` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`value_type` text DEFAULT 'input' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	CONSTRAINT `uq_ui_trans_locale_key` UNIQUE(`locale`,`key`)
);
--> statement-breakpoint
CREATE TABLE `user_config` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`user_type` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_user_single_root` ON `admin_user` (`is_root`) WHERE "admin_user"."is_root" = true;--> statement-breakpoint
CREATE INDEX `idx_captcha_target_type` ON `captcha_code` (`target`,`type`);--> statement-breakpoint
CREATE INDEX `idx_ct_entity_locale` ON `content_translation` (`entity_type`,`entity_id`,`locale`);--> statement-breakpoint
CREATE INDEX `idx_device_owner` ON `device` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_device_token_hash` ON `device` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_dict_item_dict_slug_value` ON `dict_item` (`dict_slug`,`value`);--> statement-breakpoint
CREATE INDEX `idx_file_sha256` ON `file` (`sha256`);--> statement-breakpoint
CREATE INDEX `idx_message_user` ON `message` (`user_type`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_model_usage_created_at` ON `model_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_model_usage_account` ON `model_usage` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_operation_log_module` ON `operation_log` (`module`);--> statement-breakpoint
CREATE INDEX `idx_operation_log_operator` ON `operation_log` (`operatorId`);--> statement-breakpoint
CREATE INDEX `idx_operation_log_created_at` ON `operation_log` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_system_config_group` ON `system_config` (`group_name`);--> statement-breakpoint
CREATE INDEX `idx_track_event_time` ON `track_event` (`time`);--> statement-breakpoint
CREATE INDEX `idx_track_event_name_time` ON `track_event` (`name`,`time`);--> statement-breakpoint
CREATE INDEX `idx_track_event_user_id` ON `track_event` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_track_event_session_id` ON `track_event` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_track_event_created_at` ON `track_event` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_config_user` ON `user_config` (`user_type`,`user_id`);