CREATE TABLE vocab_sets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    level VARCHAR(50) NULL,
    deleted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    INDEX idx_vocab_sets_topic (topic),
    INDEX idx_vocab_sets_level (level),
    INDEX idx_vocab_sets_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vocab_words (
    id BIGINT NOT NULL AUTO_INCREMENT,
    set_id BIGINT NOT NULL,
    word VARCHAR(150) NOT NULL,
    meaning TEXT NOT NULL,
    phonetic VARCHAR(150) NULL,
    example TEXT NULL,
    audio_url VARCHAR(512) NULL,
    deleted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_vocab_words_set FOREIGN KEY (set_id) REFERENCES vocab_sets (id),
    INDEX idx_vocab_words_set_id (set_id),
    INDEX idx_vocab_words_word (word),
    INDEX idx_vocab_words_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_vocab_progress (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    word_id BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'NEW',
    `interval` INT NOT NULL DEFAULT 0,
    ease_factor DECIMAL(4,2) NOT NULL DEFAULT 2.50,
    repetitions INT NOT NULL DEFAULT 0,
    next_review_at TIMESTAMP(6) NULL,
    last_reviewed_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_user_vocab_progress_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_user_vocab_progress_word FOREIGN KEY (word_id) REFERENCES vocab_words (id),
    CONSTRAINT uk_user_vocab_progress_user_word UNIQUE (user_id, word_id),
    INDEX idx_user_vocab_progress_user_id (user_id),
    INDEX idx_user_vocab_progress_word_id (word_id),
    INDEX idx_user_vocab_progress_next_review_at (next_review_at),
    INDEX idx_user_vocab_progress_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subscriptions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    plan_id VARCHAR(60) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    status VARCHAR(30) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_subscriptions_user_id (user_id),
    INDEX idx_subscriptions_status (status),
    INDEX idx_subscriptions_plan_id (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE transactions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_transactions_user_id (user_id),
    INDEX idx_transactions_provider (provider),
    INDEX idx_transactions_status (status),
    INDEX idx_transactions_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lessons (
    id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    video_url VARCHAR(512) NULL,
    deleted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    INDEX idx_lessons_topic (topic),
    INDEX idx_lessons_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE comments (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deleted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_comments_user_id (user_id),
    INDEX idx_comments_target (target_type, target_id),
    INDEX idx_comments_created_at (created_at),
    INDEX idx_comments_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE leaderboard_entries (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    score DECIMAL(8,2) NOT NULL,
    rank_position INT NULL,
    period VARCHAR(30) NOT NULL DEFAULT 'ALL_TIME',
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_leaderboard_entries_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_leaderboard_entries_user_period UNIQUE (user_id, period),
    INDEX idx_leaderboard_entries_period_score (period, score),
    INDEX idx_leaderboard_entries_rank_position (rank_position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_writing_jobs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    prompt TEXT NOT NULL,
    response_text TEXT NOT NULL,
    feedback TEXT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_ai_writing_jobs_user FOREIGN KEY (user_id) REFERENCES users (id),
    INDEX idx_ai_writing_jobs_user_id (user_id),
    INDEX idx_ai_writing_jobs_status (status),
    INDEX idx_ai_writing_jobs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
