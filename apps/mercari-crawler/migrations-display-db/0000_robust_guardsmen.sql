CREATE TABLE `card_watches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`card_id` text NOT NULL,
	`search_condition_id` integer NOT NULL,
	`is_current` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`search_condition_id`) REFERENCES `search_conditions`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "card_watches_is_current_check" CHECK("card_watches"."is_current" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_watches_current_unique_idx` ON `card_watches` (`user_email`,`card_id`) WHERE "card_watches"."is_current" = 1;--> statement-breakpoint
CREATE INDEX `card_watches_user_card_idx` ON `card_watches` (`user_email`,`card_id`);--> statement-breakpoint
CREATE INDEX `card_watches_search_condition_idx` ON `card_watches` (`search_condition_id`,`is_current`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`image_key` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`code`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cards_product_id_idx` ON `cards` (`product_id`);--> statement-breakpoint
CREATE TABLE `price_points` (
	`search_condition_id` integer NOT NULL,
	`crawled_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`price` integer NOT NULL,
	PRIMARY KEY(`search_condition_id`, `crawled_at`),
	FOREIGN KEY (`search_condition_id`) REFERENCES `search_conditions`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "price_points_price_check" CHECK("price_points"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE `price_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` text NOT NULL,
	`normalized_additional_keyword` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_series_card_additional_keyword_unique_idx` ON `price_series` (`card_id`,`normalized_additional_keyword`);--> statement-breakpoint
CREATE TABLE `products` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `screenshots` (
	`search_condition_id` integer NOT NULL,
	`crawled_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`image_key` text NOT NULL,
	PRIMARY KEY(`search_condition_id`, `crawled_at`),
	FOREIGN KEY (`search_condition_id`) REFERENCES `search_conditions`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`price_series_id` integer NOT NULL,
	`normalized_exclude_keyword` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`price_series_id`) REFERENCES `price_series`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_conditions_price_series_exclude_keyword_unique_idx` ON `search_conditions` (`price_series_id`,`normalized_exclude_keyword`);--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
