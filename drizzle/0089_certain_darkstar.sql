ALTER TABLE `ticket_scope_change` ADD `changed_by` text;--> statement-breakpoint
ALTER TABLE `ticket_scope_change` ADD `changed_by_account_id` text;--> statement-breakpoint
ALTER TABLE `ticket_scope_change` ADD `changed_by_avatar` text;--> statement-breakpoint
CREATE INDEX `ticket_scope_change_ticket_action_idx` ON `ticket_scope_change` (`ticket_key`,`action`);