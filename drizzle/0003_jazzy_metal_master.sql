CREATE TABLE `chat_threads` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` text,
	`source` text DEFAULT 'outbound' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_threads_run` ON `chat_threads` (`run_id`);