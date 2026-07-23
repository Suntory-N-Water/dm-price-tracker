CREATE TABLE `executes` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`started_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "executes_status_check" CHECK("executes"."status" in ('WAITING', 'RUNNING', 'FINISHED', 'ABORTED'))
);
--> statement-breakpoint
CREATE INDEX `executes_status_idx` ON `executes` (`status`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`execute_id` text NOT NULL,
	`parent_job_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`url` text NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`result_error` text,
	`started_at` text,
	`crawled_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`execute_id`) REFERENCES `executes`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`parent_job_id`) REFERENCES `jobs`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "jobs_status_check" CHECK("jobs"."status" in ('WAITING', 'RUNNING', 'FINISHED', 'ABORTED')),
	CONSTRAINT "jobs_result_count_check" CHECK("jobs"."result_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_execute_url_unique_idx` ON `jobs` (`execute_id`,`url`);--> statement-breakpoint
CREATE INDEX `jobs_execute_status_idx` ON `jobs` (`execute_id`,`status`);--> statement-breakpoint
CREATE INDEX `jobs_parent_job_id_idx` ON `jobs` (`parent_job_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`url` text NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`data` text NOT NULL,
	`started_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`crawled_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `records_job_id_idx` ON `records` (`job_id`);--> statement-breakpoint
CREATE INDEX `records_url_idx` ON `records` (`url`);
