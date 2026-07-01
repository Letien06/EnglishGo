ALTER TABLE tests
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT,
    ADD COLUMN license_note TEXT,
    ADD COLUMN reviewed_by BIGINT,
    ADD COLUMN reviewed_at TIMESTAMP(6),
    ADD COLUMN published_at TIMESTAMP(6),
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_tests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id);

CREATE INDEX idx_tests_status ON tests (status);
CREATE INDEX idx_tests_source_type ON tests (source_type);

ALTER TABLE questions
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT,
    ADD COLUMN license_note TEXT,
    ADD COLUMN reviewed_by BIGINT,
    ADD COLUMN reviewed_at TIMESTAMP(6),
    ADD COLUMN published_at TIMESTAMP(6),
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_questions_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id);

CREATE INDEX idx_questions_status ON questions (status);
CREATE INDEX idx_questions_source_type ON questions (source_type);

ALTER TABLE vocab_sets
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT,
    ADD COLUMN license_note TEXT,
    ADD COLUMN reviewed_by BIGINT,
    ADD COLUMN reviewed_at TIMESTAMP(6),
    ADD COLUMN published_at TIMESTAMP(6),
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_vocab_sets_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id);

CREATE INDEX idx_vocab_sets_status ON vocab_sets (status);
CREATE INDEX idx_vocab_sets_source_type ON vocab_sets (source_type);

ALTER TABLE vocab_words
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT,
    ADD COLUMN license_note TEXT,
    ADD COLUMN reviewed_by BIGINT,
    ADD COLUMN reviewed_at TIMESTAMP(6),
    ADD COLUMN published_at TIMESTAMP(6),
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_vocab_words_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id);

CREATE INDEX idx_vocab_words_status ON vocab_words (status);
CREATE INDEX idx_vocab_words_source_type ON vocab_words (source_type);

ALTER TABLE lessons
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT,
    ADD COLUMN license_note TEXT,
    ADD COLUMN reviewed_by BIGINT,
    ADD COLUMN reviewed_at TIMESTAMP(6),
    ADD COLUMN published_at TIMESTAMP(6),
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT fk_lessons_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id);

CREATE INDEX idx_lessons_status ON lessons (status);
CREATE INDEX idx_lessons_source_type ON lessons (source_type);
