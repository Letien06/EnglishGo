CREATE TABLE vocab_sets (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    level VARCHAR(50),
    deleted_at TIMESTAMP(6)
);

CREATE INDEX idx_vocab_sets_topic ON vocab_sets (topic);
CREATE INDEX idx_vocab_sets_level ON vocab_sets (level);
CREATE INDEX idx_vocab_sets_deleted_at ON vocab_sets (deleted_at);

CREATE TABLE vocab_words (
    id BIGSERIAL PRIMARY KEY,
    set_id BIGINT NOT NULL,
    word VARCHAR(150) NOT NULL,
    meaning TEXT NOT NULL,
    phonetic VARCHAR(150),
    example TEXT,
    audio_url VARCHAR(512),
    deleted_at TIMESTAMP(6),
    CONSTRAINT fk_vocab_words_set FOREIGN KEY (set_id) REFERENCES vocab_sets (id)
);

CREATE INDEX idx_vocab_words_set_id ON vocab_words (set_id);
CREATE INDEX idx_vocab_words_word ON vocab_words (word);
CREATE INDEX idx_vocab_words_deleted_at ON vocab_words (deleted_at);

CREATE TABLE user_vocab_progress (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    word_id BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'NEW',
    interval INT NOT NULL DEFAULT 0,
    ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50,
    repetitions INT NOT NULL DEFAULT 0,
    next_review_at TIMESTAMP(6),
    last_reviewed_at TIMESTAMP(6),
    CONSTRAINT fk_user_vocab_progress_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_user_vocab_progress_word FOREIGN KEY (word_id) REFERENCES vocab_words (id),
    CONSTRAINT uk_user_vocab_progress_user_word UNIQUE (user_id, word_id)
);

CREATE INDEX idx_user_vocab_progress_user_id ON user_vocab_progress (user_id);
CREATE INDEX idx_user_vocab_progress_word_id ON user_vocab_progress (word_id);
CREATE INDEX idx_user_vocab_progress_next_review_at ON user_vocab_progress (next_review_at);
CREATE INDEX idx_user_vocab_progress_status ON user_vocab_progress (status);

CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    plan_id VARCHAR(60) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(30) NOT NULL,
    CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions (plan_id);

CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_transactions_user_id ON transactions (user_id);
CREATE INDEX idx_transactions_provider ON transactions (provider);
CREATE INDEX idx_transactions_status ON transactions (status);
CREATE INDEX idx_transactions_created_at ON transactions (created_at);

CREATE TABLE lessons (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    topic VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    video_url VARCHAR(512),
    deleted_at TIMESTAMP(6)
);

CREATE INDEX idx_lessons_topic ON lessons (topic);
CREATE INDEX idx_lessons_deleted_at ON lessons (deleted_at);

CREATE TABLE comments (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP(6),
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_comments_user_id ON comments (user_id);
CREATE INDEX idx_comments_target ON comments (target_type, target_id);
CREATE INDEX idx_comments_created_at ON comments (created_at);
CREATE INDEX idx_comments_deleted_at ON comments (deleted_at);

CREATE TABLE leaderboard_entries (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    score NUMERIC(8,2) NOT NULL,
    rank_position INT,
    period VARCHAR(30) NOT NULL DEFAULT 'ALL_TIME',
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_leaderboard_entries_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT uk_leaderboard_entries_user_period UNIQUE (user_id, period)
);

CREATE INDEX idx_leaderboard_entries_period_score ON leaderboard_entries (period, score);
CREATE INDEX idx_leaderboard_entries_rank_position ON leaderboard_entries (rank_position);

CREATE TABLE ai_writing_jobs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    prompt TEXT NOT NULL,
    response_text TEXT NOT NULL,
    feedback TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP(6),
    CONSTRAINT fk_ai_writing_jobs_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_ai_writing_jobs_user_id ON ai_writing_jobs (user_id);
CREATE INDEX idx_ai_writing_jobs_status ON ai_writing_jobs (status);
CREATE INDEX idx_ai_writing_jobs_created_at ON ai_writing_jobs (created_at);
