CREATE TABLE `ticket_subtask` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`subtask_key` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`status` text NOT NULL,
	`assignee` text,
	`assignee_avatar` text,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ticket_subtask_ticket_key_idx` ON `ticket_subtask` (`ticket_key`);
--> statement-breakpoint
CREATE TABLE `ticket_link` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_key` text NOT NULL,
	`jira_link_id` text,
	`relation` text NOT NULL,
	`linked_key` text NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`status` text NOT NULL,
	`assignee` text,
	`assignee_avatar` text,
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ticket_link_ticket_key_idx` ON `ticket_link` (`ticket_key`);
