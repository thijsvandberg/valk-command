CREATE TABLE `jira_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`jira_comment_id` text,
	`author_name` text NOT NULL,
	`author_avatar` text,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `po_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`author` text DEFAULT 'Product Owner' NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ticket_attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`jira_attachment_id` text,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`downloaded_at` text,
	`local_path` text,
	`cleaned_at` text
);
--> statement-breakpoint
CREATE TABLE `ticket_local_edit` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`field` text NOT NULL,
	`local_value` text NOT NULL,
	`base_jira_version` text,
	`modified_at` text DEFAULT (datetime('now')) NOT NULL
);
