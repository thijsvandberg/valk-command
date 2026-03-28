CREATE TABLE `alert` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`jira_key` text,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	`read` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`related_ticket` text
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` text NOT NULL,
	`workspace_task_id` text,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scheduled_job` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cron_expression` text NOT NULL,
	`skill_name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`last_result_summary` text
);
--> statement-breakpoint
CREATE TABLE `ticket` (
	`jira_key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`assignee` text,
	`story_points` real,
	`sprint_name` text,
	`labels` text,
	`priority` text,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE TABLE `ticket_metadata` (
	`jira_key` text PRIMARY KEY NOT NULL,
	`refinement_readiness` text DEFAULT 'not_ready' NOT NULL,
	`quality_score` real,
	`effort_scores` text,
	`po_notes` text,
	`po_priority` integer,
	`test_status` text DEFAULT 'untested' NOT NULL,
	`last_test_run_at` text,
	`last_test_report_url` text,
	FOREIGN KEY (`jira_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspace_task` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_name` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`related_ticket` text,
	`conversation_id` text
);
