CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`role` text NOT NULL,
	`parent_agent_id` text,
	`scope_md` text NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`scratchpad_md` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_run` ON `agents` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` text,
	`task_id` text,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`ts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_run` ON `events` (`run_id`,`ts`);--> statement-breakpoint
CREATE TABLE `inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text,
	`content_md` text NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_agent` ON `inbox` (`agent_id`,`status`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`instruction_md` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`root_agent_id` text,
	`created_at` integer NOT NULL,
	`stopped_at` integer
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`received_at` integer NOT NULL,
	`matched_wait_id` text
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`requester_agent_id` text NOT NULL,
	`scope_md` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`depth` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`claimed_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `waits` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`description` text NOT NULL,
	`satisfied_by_json` text DEFAULT '[]' NOT NULL,
	`check_every_ms` integer,
	`next_check_at` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`satisfied_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_waits_run` ON `waits` (`run_id`,`status`);