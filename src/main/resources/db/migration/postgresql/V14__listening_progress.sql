CREATE TABLE listening_progress (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    source VARCHAR(30) NOT NULL,
    part INT NOT NULL,
    level INT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NOT NULL,
    selected_answer VARCHAR(10),
    correct_answer VARCHAR(10),
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    mode_used VARCHAR(30) NOT NULL,
    assist_percent INT NOT NULL DEFAULT 30,
    replay_count INT NOT NULL DEFAULT 0,
    completed_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_listening_progress_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_listening_progress_user_question UNIQUE (user_id, question_id)
);

CREATE INDEX idx_listening_progress_user_part_level ON listening_progress (user_id, part, level);
