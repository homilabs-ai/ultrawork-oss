ALTER TABLE `tasks` ADD `type` text DEFAULT 'worker' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `verdict` text;