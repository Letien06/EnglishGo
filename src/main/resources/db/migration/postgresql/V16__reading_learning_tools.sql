CREATE TABLE reading_progress (
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
    elapsed_seconds INT NOT NULL DEFAULT 0,
    completed_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_reading_progress_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_reading_progress_user_question UNIQUE (user_id, question_id)
);

CREATE INDEX idx_reading_progress_user_part_level ON reading_progress (user_id, part, level);

CREATE TABLE reading_notes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80),
    note TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_reading_notes_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_reading_notes_user_item ON reading_notes (user_id, item_id);

CREATE TABLE reading_favorites (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80),
    part INT NOT NULL,
    level INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_reading_favorites_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_reading_favorites_user_item UNIQUE (user_id, item_id)
);

CREATE INDEX idx_reading_favorites_user_part_level ON reading_favorites (user_id, part, level);

CREATE TABLE reading_vocab_basket (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80),
    word VARCHAR(150) NOT NULL,
    meaning VARCHAR(500),
    example VARCHAR(1000),
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_reading_vocab_basket_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_reading_vocab_basket_user_word ON reading_vocab_basket (user_id, word);
