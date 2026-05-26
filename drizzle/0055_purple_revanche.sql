CREATE TABLE `refinement_session_ticket_note` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ticket_key` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `refinement_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rstn_session_id_idx` ON `refinement_session_ticket_note` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rstn_session_ticket_unique` ON `refinement_session_ticket_note` (`session_id`,`ticket_key`);--> statement-breakpoint
ALTER TABLE `refinement_session` ADD `general_comment` text;--> statement-breakpoint
ALTER TABLE `refinement_session` ADD `current_index` integer DEFAULT 0 NOT NULL;