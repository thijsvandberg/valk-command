-- Remove duplicate followed_ticket rows, keeping the oldest per ticket_key
DELETE FROM followed_ticket
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM followed_ticket
  GROUP BY ticket_key
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `followed_ticket_key_unique_idx` ON `followed_ticket` (`ticket_key`);
