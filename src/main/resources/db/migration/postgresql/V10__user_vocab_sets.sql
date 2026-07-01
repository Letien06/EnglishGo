ALTER TABLE vocab_sets
    ADD COLUMN created_by BIGINT;

ALTER TABLE vocab_sets
    ADD CONSTRAINT fk_vocab_sets_created_by
        FOREIGN KEY (created_by) REFERENCES users (id);

CREATE INDEX idx_vocab_sets_created_by_status ON vocab_sets (created_by, status);
