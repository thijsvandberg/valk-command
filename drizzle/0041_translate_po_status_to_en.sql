-- Translate po_status values from Dutch to English
UPDATE ticket_metadata SET po_status = 'New' WHERE po_status = 'Nieuw';
UPDATE ticket_metadata SET po_status = 'Draft' WHERE po_status = 'Uitwerken';
UPDATE ticket_metadata SET po_status = 'Awaiting Feedback' WHERE po_status = 'Wachten op feedback';
UPDATE ticket_metadata SET po_status = 'Ready for Refinement' WHERE po_status = 'Klaar voor refinement';
UPDATE ticket_metadata SET po_status = 'On Hold' WHERE po_status = 'Geparkeerd';
