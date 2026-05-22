ALTER TABLE `message` ADD `sequence` integer;--> statement-breakpoint

-- Backfill existing messages with sequence numbers per conversation
-- ordered by (timestamp, id) to maintain current ordering
UPDATE message SET sequence = (
  SELECT COUNT(*) FROM message m2
  WHERE m2.conversation_id = message.conversation_id
  AND (m2.timestamp < message.timestamp
    OR (m2.timestamp = message.timestamp AND m2.id <= message.id))
);--> statement-breakpoint

CREATE INDEX `message_conversation_sequence_idx` ON `message` (`conversation_id`,`sequence`);
