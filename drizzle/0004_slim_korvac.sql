CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`scope` text,
	`status` text NOT NULL,
	`summary` text,
	`error_detail` text,
	`duration_ms` integer,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`acknowledged` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ticket` ADD `type` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `assignee_avatar` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `epic` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `flagged` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ticket` ADD `reporter` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `description` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `acceptance_criteria` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `components` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `jira_created_at` text;--> statement-breakpoint
ALTER TABLE `ticket` ADD `jira_updated_at` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_jira_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`jira_comment_id` text,
	`author_name` text NOT NULL,
	`author_avatar` text,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_jira_comment`("id", "ticket_key", "jira_comment_id", "author_name", "author_avatar", "content", "created_at") SELECT "id", "ticket_key", "jira_comment_id", "author_name", "author_avatar", "content", "created_at" FROM `jira_comment`;--> statement-breakpoint
DROP TABLE `jira_comment`;--> statement-breakpoint
ALTER TABLE `__new_jira_comment` RENAME TO `jira_comment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_po_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`author` text DEFAULT 'Product Owner' NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_po_comment`("id", "ticket_key", "author", "content", "created_at") SELECT "id", "ticket_key", "author", "content", "created_at" FROM `po_comment`;--> statement-breakpoint
DROP TABLE `po_comment`;--> statement-breakpoint
ALTER TABLE `__new_po_comment` RENAME TO `po_comment`;--> statement-breakpoint
CREATE TABLE `__new_ticket_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`jira_attachment_id` text,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`downloaded_at` text,
	`local_path` text,
	`cleaned_at` text,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_ticket_attachment`("id", "ticket_key", "jira_attachment_id", "filename", "mime_type", "size", "downloaded_at", "local_path", "cleaned_at") SELECT "id", "ticket_key", "jira_attachment_id", "filename", "mime_type", "size", "downloaded_at", "local_path", "cleaned_at" FROM `ticket_attachment`;--> statement-breakpoint
DROP TABLE `ticket_attachment`;--> statement-breakpoint
ALTER TABLE `__new_ticket_attachment` RENAME TO `ticket_attachment`;--> statement-breakpoint
CREATE TABLE `__new_ticket_local_edit` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`field` text NOT NULL,
	`local_value` text NOT NULL,
	`base_jira_version` text,
	`modified_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_ticket_local_edit`("id", "ticket_key", "field", "local_value", "base_jira_version", "modified_at") SELECT "id", "ticket_key", "field", "local_value", "base_jira_version", "modified_at" FROM `ticket_local_edit`;--> statement-breakpoint
DROP TABLE `ticket_local_edit`;--> statement-breakpoint
ALTER TABLE `__new_ticket_local_edit` RENAME TO `ticket_local_edit`;