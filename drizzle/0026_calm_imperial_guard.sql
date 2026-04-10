CREATE INDEX `activity_log_type_idx` ON `activity_log` (`type`);--> statement-breakpoint
CREATE INDEX `ticket_status_idx` ON `ticket` (`status`);--> statement-breakpoint
CREATE INDEX `ticket_assignee_idx` ON `ticket` (`assignee`);--> statement-breakpoint
CREATE INDEX `ticket_type_idx` ON `ticket` (`type`);--> statement-breakpoint
CREATE INDEX `ticket_epic_key_idx` ON `ticket` (`epic_key`);--> statement-breakpoint
CREATE INDEX `ticket_sprint_status_idx` ON `ticket` (`sprint_name`,`status`);--> statement-breakpoint
CREATE INDEX `workspace_task_status_idx` ON `workspace_task` (`status`);--> statement-breakpoint
CREATE INDEX `workspace_task_conversation_id_idx` ON `workspace_task` (`conversation_id`);