CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sprint_slot` (
	`slot_index` integer PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`sprint_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `story_version` (
	`id` text PRIMARY KEY NOT NULL,
	`jira_key` text NOT NULL,
	`description` text NOT NULL,
	`acceptance_criteria` text,
	`content_hash` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`jira_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL,
	`workspace_task_id` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_message`("id", "conversation_id", "role", "content", "timestamp", "workspace_task_id") SELECT "id", "conversation_id", "role", "content", "timestamp", "workspace_task_id" FROM `message`;--> statement-breakpoint
DROP TABLE `message`;--> statement-breakpoint
ALTER TABLE `__new_message` RENAME TO `message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`related_ticket` text
);
--> statement-breakpoint
INSERT INTO `__new_conversation`("id", "title", "created_at", "related_ticket") SELECT "id", "title", "created_at", "related_ticket" FROM `conversation`;--> statement-breakpoint
DROP TABLE `conversation`;--> statement-breakpoint
ALTER TABLE `__new_conversation` RENAME TO `conversation`;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `po_status` text;--> statement-breakpoint
ALTER TABLE `ticket_metadata` ADD `quality_stale` integer DEFAULT false NOT NULL;