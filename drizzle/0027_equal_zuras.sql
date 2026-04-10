CREATE TABLE `followed_ticket` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `followed_ticket_key_idx` ON `followed_ticket` (`ticket_key`);--> statement-breakpoint
CREATE TABLE `pipeline_run` (
	`id` text PRIMARY KEY NOT NULL,
	`repo` text NOT NULL,
	`build_number` integer NOT NULL,
	`branch_name` text NOT NULL,
	`ticket_key` text,
	`state` text NOT NULL,
	`duration_seconds` integer,
	`pipeline_url` text NOT NULL,
	`is_deployment` integer DEFAULT false NOT NULL,
	`environment` text,
	`environment_type` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`previous_state` text
);
--> statement-breakpoint
CREATE INDEX `pipeline_run_repo_idx` ON `pipeline_run` (`repo`);--> statement-breakpoint
CREATE INDEX `pipeline_run_ticket_key_idx` ON `pipeline_run` (`ticket_key`);--> statement-breakpoint
CREATE INDEX `pipeline_run_state_idx` ON `pipeline_run` (`state`);--> statement-breakpoint
CREATE INDEX `pipeline_run_created_at_idx` ON `pipeline_run` (`created_at`);--> statement-breakpoint
CREATE INDEX `pipeline_run_deployment_idx` ON `pipeline_run` (`is_deployment`,`environment`);--> statement-breakpoint
ALTER TABLE `alert` ADD `category` text;--> statement-breakpoint
ALTER TABLE `alert` ADD `link_url` text;--> statement-breakpoint
CREATE INDEX `alert_read_idx` ON `alert` (`read`);--> statement-breakpoint
CREATE INDEX `alert_created_at_idx` ON `alert` (`created_at`);--> statement-breakpoint
CREATE INDEX `alert_jira_key_idx` ON `alert` (`jira_key`);