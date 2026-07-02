CREATE TABLE IF NOT EXISTS reading_progress (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    source VARCHAR(30) NOT NULL,
    part INT NOT NULL,
    level INT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NOT NULL,
    selected_answer VARCHAR(10) NULL,
    correct_answer VARCHAR(10) NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    mode_used VARCHAR(30) NOT NULL,
    assist_percent INT NOT NULL DEFAULT 30,
    elapsed_seconds INT NOT NULL DEFAULT 0,
    completed_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_reading_progress_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_reading_progress_user_question UNIQUE (user_id, question_id),
    INDEX idx_reading_progress_user_part_level (user_id, part, level)
);

CREATE TABLE IF NOT EXISTS reading_notes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_reading_notes_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_reading_notes_user_item (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS reading_favorites (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NULL,
    part INT NOT NULL,
    level INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_reading_favorites_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_reading_favorites_user_item UNIQUE (user_id, item_id),
    INDEX idx_reading_favorites_user_part_level (user_id, part, level)
);

CREATE TABLE IF NOT EXISTS reading_vocab_basket (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NULL,
    word VARCHAR(150) NOT NULL,
    meaning VARCHAR(500) NULL,
    example VARCHAR(1000) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_reading_vocab_basket_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_reading_vocab_basket_user_word (user_id, word)
);
