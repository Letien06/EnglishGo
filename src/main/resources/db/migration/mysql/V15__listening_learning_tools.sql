CREATE TABLE IF NOT EXISTS listening_notes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_listening_notes_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_listening_notes_user_item (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS listening_favorites (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NULL,
    part INT NOT NULL,
    level INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_listening_favorites_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_listening_favorites_user_item UNIQUE (user_id, item_id),
    INDEX idx_listening_favorites_user_part_level (user_id, part, level)
);

CREATE TABLE IF NOT EXISTS listening_vocab_basket (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    item_id VARCHAR(80) NOT NULL,
    question_id VARCHAR(80) NULL,
    word VARCHAR(150) NOT NULL,
    meaning VARCHAR(500) NULL,
    example VARCHAR(1000) NULL,
    created_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_listening_vocab_basket_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_listening_vocab_basket_user_word (user_id, word)
);
