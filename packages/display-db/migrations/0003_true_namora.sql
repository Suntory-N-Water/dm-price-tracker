CREATE TABLE `crawl_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`product_code` text,
	`status` text NOT NULL,
	`retried_from_run_id` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`product_code`) REFERENCES `products`(`code`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`retried_from_run_id`) REFERENCES `crawl_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "crawl_runs_kind_check" CHECK("crawl_runs"."kind" in ('MERCARI', 'OFFICIAL_PRODUCTS', 'OFFICIAL_CARD_IDS', 'OFFICIAL_CARD_DETAILS')),
	CONSTRAINT "crawl_runs_status_check" CHECK("crawl_runs"."status" in ('RUNNING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX `crawl_runs_kind_product_code_created_at_idx` ON `crawl_runs` (`kind`,`product_code`,`created_at`);--> statement-breakpoint
CREATE TABLE `crawl_targets` (
	`crawl_run_id` text NOT NULL,
	`target_id` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`crawl_run_id`, `target_id`),
	FOREIGN KEY (`crawl_run_id`) REFERENCES `crawl_runs`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "crawl_targets_status_check" CHECK("crawl_targets"."status" in ('PENDING', 'SUCCEEDED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE `pending_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`code`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pending_cards_product_id_idx` ON `pending_cards` (`product_id`);