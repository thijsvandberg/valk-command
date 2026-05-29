DROP INDEX `stored_review_ticket_key_idx`;--> statement-breakpoint
DROP INDEX `stored_review_created_at_idx`;--> statement-breakpoint
CREATE INDEX `stored_review_ticket_key_created_at_idx` ON `stored_review` (`ticket_key`,`created_at`);--> statement-breakpoint
DROP INDEX `story_version_jira_key_idx`;--> statement-breakpoint
CREATE INDEX `story_version_jira_key_created_at_idx` ON `story_version` (`jira_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `conversation_related_ticket_idx` ON `conversation` (`related_ticket`);