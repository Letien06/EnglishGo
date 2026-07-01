ALTER TABLE vocab_sets
    ADD COLUMN description TEXT NULL AFTER topic,
    ADD COLUMN icon VARCHAR(20) NULL AFTER description;
