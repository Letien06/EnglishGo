ALTER TABLE tests
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT NULL,
    ADD COLUMN license_note TEXT NULL,
    ADD COLUMN reviewed_by BIGINT NULL,
    ADD COLUMN reviewed_at TIMESTAMP(6) NULL,
    ADD COLUMN published_at TIMESTAMP(6) NULL,
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    ADD CONSTRAINT fk_tests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id),
    ADD INDEX idx_tests_status (status),
    ADD INDEX idx_tests_source_type (source_type);

ALTER TABLE questions
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT NULL,
    ADD COLUMN license_note TEXT NULL,
    ADD COLUMN reviewed_by BIGINT NULL,
    ADD COLUMN reviewed_at TIMESTAMP(6) NULL,
    ADD COLUMN published_at TIMESTAMP(6) NULL,
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    ADD CONSTRAINT fk_questions_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id),
    ADD INDEX idx_questions_status (status),
    ADD INDEX idx_questions_source_type (source_type);

ALTER TABLE vocab_sets
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT NULL,
    ADD COLUMN license_note TEXT NULL,
    ADD COLUMN reviewed_by BIGINT NULL,
    ADD COLUMN reviewed_at TIMESTAMP(6) NULL,
    ADD COLUMN published_at TIMESTAMP(6) NULL,
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    ADD CONSTRAINT fk_vocab_sets_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id),
    ADD INDEX idx_vocab_sets_status (status),
    ADD INDEX idx_vocab_sets_source_type (source_type);

ALTER TABLE vocab_words
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT NULL,
    ADD COLUMN license_note TEXT NULL,
    ADD COLUMN reviewed_by BIGINT NULL,
    ADD COLUMN reviewed_at TIMESTAMP(6) NULL,
    ADD COLUMN published_at TIMESTAMP(6) NULL,
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    ADD CONSTRAINT fk_vocab_words_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id),
    ADD INDEX idx_vocab_words_status (status),
    ADD INDEX idx_vocab_words_source_type (source_type);

ALTER TABLE lessons
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN source_note TEXT NULL,
    ADD COLUMN license_note TEXT NULL,
    ADD COLUMN reviewed_by BIGINT NULL,
    ADD COLUMN reviewed_at TIMESTAMP(6) NULL,
    ADD COLUMN published_at TIMESTAMP(6) NULL,
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    ADD CONSTRAINT fk_lessons_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id),
    ADD INDEX idx_lessons_status (status),
    ADD INDEX idx_lessons_source_type (source_type);
