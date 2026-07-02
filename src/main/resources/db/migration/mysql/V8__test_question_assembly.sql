CREATE TABLE IF NOT EXISTS test_questions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    test_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    display_order INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_test_questions_test FOREIGN KEY (test_id) REFERENCES tests (id),
    CONSTRAINT fk_test_questions_question FOREIGN KEY (question_id) REFERENCES questions (id),
    CONSTRAINT uk_test_questions_test_question UNIQUE (test_id, question_id),
    INDEX idx_test_questions_test_order (test_id, display_order),
    INDEX idx_test_questions_question_id (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
