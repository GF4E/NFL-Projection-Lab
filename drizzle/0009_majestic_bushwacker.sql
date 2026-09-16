CREATE TABLE IF NOT EXISTS `engine_projection_edit_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payload` text NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS projection_history_insert AFTER INSERT ON engine_projection_entries BEGIN
 INSERT INTO engine_projection_edit_history(payload) VALUES(NEW.payload);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS projection_history_update AFTER UPDATE ON engine_projection_entries BEGIN
 INSERT INTO engine_projection_edit_history(payload) VALUES(NEW.payload);
END;
