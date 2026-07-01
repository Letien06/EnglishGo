CREATE TABLE vocab_folders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP(6),
    CONSTRAINT fk_vocab_folders_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_vocab_folders_user_updated ON vocab_folders (user_id, updated_at);
CREATE INDEX idx_vocab_folders_deleted_at ON vocab_folders (deleted_at);

ALTER TABLE vocab_sets
    ADD COLUMN folder_id BIGINT;

ALTER TABLE vocab_sets
    ADD CONSTRAINT fk_vocab_sets_folder
        FOREIGN KEY (folder_id) REFERENCES vocab_folders (id);

CREATE INDEX idx_vocab_sets_folder_status ON vocab_sets (folder_id, status);
