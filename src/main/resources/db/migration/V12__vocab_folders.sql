CREATE TABLE vocab_folders (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_vocab_folders_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_vocab_folders_user_updated (user_id, updated_at),
    INDEX idx_vocab_folders_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE vocab_sets
    ADD COLUMN folder_id BIGINT NULL AFTER created_by;

ALTER TABLE vocab_sets
    ADD CONSTRAINT fk_vocab_sets_folder
        FOREIGN KEY (folder_id) REFERENCES vocab_folders (id);

CREATE INDEX idx_vocab_sets_folder_status ON vocab_sets (folder_id, status);
