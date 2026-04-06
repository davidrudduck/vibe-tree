CREATE TABLE `terminal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_path` text NOT NULL,
	`worktree_path` text NOT NULL,
	`tmux_session_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity` integer NOT NULL
);
