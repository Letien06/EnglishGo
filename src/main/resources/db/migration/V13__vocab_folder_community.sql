ALTER TABLE vocab_folders
    ADD COLUMN public_shared BOOLEAN NOT NULL DEFAULT FALSE AFTER name,
    ADD COLUMN shared_at TIMESTAMP(6) NULL AFTER public_shared;

CREATE INDEX idx_vocab_folders_public_shared_at ON vocab_folders (public_shared, shared_at);
