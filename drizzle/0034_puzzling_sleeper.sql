CREATE TABLE `stakeholder_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` integer NOT NULL,
	`sprint_name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`content` text,
	`narrative` text,
	`risks` text,
	`workspace_task_id` text,
	`conversation_id` text,
	`snapshot_done_points` integer DEFAULT 0 NOT NULL,
	`snapshot_todo_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `stakeholder_analysis_sprint_id_idx` ON `stakeholder_analysis` (`sprint_id`);--> statement-breakpoint
CREATE INDEX `stakeholder_analysis_sprint_type_idx` ON `stakeholder_analysis` (`sprint_id`,`type`);