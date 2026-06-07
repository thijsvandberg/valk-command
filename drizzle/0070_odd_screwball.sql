ALTER TABLE `story_writer_session` ADD `mode` text DEFAULT 'story' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_writer_session` ADD `phase` text DEFAULT 'feed' NOT NULL;