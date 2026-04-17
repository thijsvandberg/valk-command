-- Add readiness column to ticket_metadata.
-- Replaces poStatus with new values: drafting, waiting_for_feedback, ready_to_refine, on_hold, null.
ALTER TABLE `ticket_metadata` ADD `readiness` text;--> statement-breakpoint
-- Migrate existing poStatus values to readiness (handles both English and legacy Dutch values).
UPDATE `ticket_metadata` SET `readiness` = CASE
  WHEN po_status IN ('Draft', 'Uitwerken')                                  THEN 'drafting'
  WHEN po_status IN ('Awaiting Feedback', 'Wachten op feedback')            THEN 'waiting_for_feedback'
  WHEN po_status IN ('Ready for Refinement', 'Klaar voor refinement')       THEN 'ready_to_refine'
  WHEN po_status IN ('On Hold', 'Geparkeerd')                               THEN 'on_hold'
  ELSE NULL
END;
