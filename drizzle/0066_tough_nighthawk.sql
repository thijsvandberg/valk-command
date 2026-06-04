CREATE TABLE `deprecated_area_keyword` (
	`id` text PRIMARY KEY NOT NULL,
	`term` text NOT NULL,
	`aliases` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deprecated_area_keyword_term_idx` ON `deprecated_area_keyword` (`term`);--> statement-breakpoint
-- Seed the deprecated-area list (BRDG-285). Safe because the table is created
-- empty in this same migration; the PO edits the list from /settings/deprecated-areas afterwards.
INSERT INTO `deprecated_area_keyword` (`id`, `term`, `aliases`, `note`) VALUES
	('seed-cwi', 'CWI', '', 'Retired product area, superseded.'),
	('seed-rezexchange', 'RezExchange', 'Rez Exchange', 'Retired product area, superseded.'),
	('seed-idpms', 'IDPMS', '', 'Retired product area, superseded.'),
	('seed-hybrid-cloud', 'hybrid cloud', 'hybrid-cloud', 'Retired infrastructure approach, superseded.');