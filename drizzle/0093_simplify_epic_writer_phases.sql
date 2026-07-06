-- BRDG-488: simplify Epic Writer phases from six to five.
-- The bullets-only "refine" step is dropped (a breakdown turn already emits
-- titles AND bullets) and the full-detail "detail" step is renamed to "refine".
-- The phase column has no CHECK constraint (drizzle enum is a TS-only type),
-- so this is a pure data migration.
--
-- Order matters: fold the OLD "refine" rows back into "breakdown" FIRST, then
-- rename the OLD "detail" rows to "refine". Running refine->breakdown first
-- prevents the just-renamed detail->refine rows from being re-caught.
UPDATE `story_writer_session` SET `phase` = 'breakdown' WHERE `phase` = 'refine';--> statement-breakpoint
UPDATE `story_writer_session` SET `phase` = 'refine' WHERE `phase` = 'detail';
