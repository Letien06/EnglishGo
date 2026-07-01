CREATE TABLE IF NOT EXISTS test_questions (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    display_order INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_test_questions_test FOREIGN KEY (test_id) REFERENCES tests (id),
    CONSTRAINT fk_test_questions_question FOREIGN KEY (question_id) REFERENCES questions (id),
    CONSTRAINT uk_test_questions_test_question UNIQUE (test_id, question_id)
);

CREATE INDEX idx_test_questions_test_order ON test_questions (test_id, display_order);
CREATE INDEX idx_test_questions_question_id ON test_questions (question_id);
