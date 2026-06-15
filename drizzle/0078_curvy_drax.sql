CREATE TABLE `ticket_sprint` (
	`ticket_key` text NOT NULL,
	`sprint_id` text NOT NULL,
	PRIMARY KEY(`ticket_key`, `sprint_id`),
	FOREIGN KEY (`ticket_key`) REFERENCES `ticket`(`jira_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_sprint_sprint_id_idx` ON `ticket_sprint` (`sprint_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `ticket_sprint` (`ticket_key`, `sprint_id`) SELECT t.`jira_key`, je.`value` FROM `ticket` t, json_each(t.`sprint_ids`) je WHERE t.`sprint_ids` IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `ticket_sprint` (`ticket_key`, `sprint_id`) SELECT t.`jira_key`, t.`sprint_name` FROM `ticket` t WHERE t.`sprint_ids` IS NULL AND t.`sprint_name` IS NOT NULL AND t.`sprint_name` != '';