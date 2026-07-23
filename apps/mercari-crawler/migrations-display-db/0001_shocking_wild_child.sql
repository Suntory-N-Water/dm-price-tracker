CREATE TABLE `user_common_exclude_keywords` (
	`user_email` text NOT NULL,
	`position` integer NOT NULL,
	`keyword` text NOT NULL,
	PRIMARY KEY(`user_email`, `position`),
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "user_common_exclude_keywords_position_check" CHECK("user_common_exclude_keywords"."position" between 0 and 2)
);
