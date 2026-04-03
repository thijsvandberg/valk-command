ALTER TABLE `story_writer_session` ADD COLUMN `target_ticket_key` text;--> statement-breakpoint
ALTER TABLE `story_writer_session` ADD COLUMN `target_local_draft` text;--> statement-breakpoint
ALTER TABLE `story_writer_draft` ADD COLUMN `story_slot` text NOT NULL DEFAULT 'original';
