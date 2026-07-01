CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(150),
    avatar_url VARCHAR(512),
    role VARCHAR(30) NOT NULL DEFAULT 'STUDENT',
    level VARCHAR(50),
    target_score INT,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_users_firebase_uid UNIQUE (firebase_uid),
    CONSTRAINT uk_users_email UNIQUE (email)
);

CREATE INDEX idx_users_role ON users (role);

CREATE TABLE tests (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    duration INT NOT NULL,
    difficulty VARCHAR(50),
    version INT NOT NULL DEFAULT 1,
    created_by BIGINT NOT NULL,
    deleted_at TIMESTAMP(6),
    CONSTRAINT fk_tests_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE INDEX idx_tests_type ON tests (type);
CREATE INDEX idx_tests_difficulty ON tests (difficulty);
CREATE INDEX idx_tests_created_by ON tests (created_by);
CREATE INDEX idx_tests_deleted_at ON tests (deleted_at);

CREATE TABLE question_groups (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT NOT NULL,
    passage_text TEXT,
    audio_url VARCHAR(512),
    image_url VARCHAR(512),
    CONSTRAINT fk_question_groups_test FOREIGN KEY (test_id) REFERENCES tests (id)
);

CREATE INDEX idx_question_groups_test_id ON question_groups (test_id);

CREATE TABLE questions (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT NOT NULL,
    group_id BIGINT,
    part INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    audio_url VARCHAR(512),
    image_url VARCHAR(512),
    explanation TEXT,
    deleted_at TIMESTAMP(6),
    CONSTRAINT fk_questions_test FOREIGN KEY (test_id) REFERENCES tests (id),
    CONSTRAINT fk_questions_group FOREIGN KEY (group_id) REFERENCES question_groups (id)
);

CREATE INDEX idx_questions_test_id ON questions (test_id);
CREATE INDEX idx_questions_group_id ON questions (group_id);
CREATE INDEX idx_questions_part ON questions (part);
CREATE INDEX idx_questions_type ON questions (type);
CREATE INDEX idx_questions_deleted_at ON questions (deleted_at);

CREATE TABLE answer_options (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_answer_options_question FOREIGN KEY (question_id) REFERENCES questions (id)
);

CREATE INDEX idx_answer_options_question_id ON answer_options (question_id);
CREATE INDEX idx_answer_options_is_correct ON answer_options (is_correct);

CREATE TABLE accepted_answers (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL,
    answer_text VARCHAR(1000) NOT NULL,
    case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_accepted_answers_question FOREIGN KEY (question_id) REFERENCES questions (id)
);

CREATE INDEX idx_accepted_answers_question_id ON accepted_answers (question_id);

CREATE TABLE user_attempts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    test_id BIGINT NOT NULL,
    score NUMERIC(6,2),
    started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP(6),
    CONSTRAINT fk_user_attempts_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_user_attempts_test FOREIGN KEY (test_id) REFERENCES tests (id)
);

CREATE INDEX idx_user_attempts_user_id ON user_attempts (user_id);
CREATE INDEX idx_user_attempts_test_id ON user_attempts (test_id);
CREATE INDEX idx_user_attempts_submitted_at ON user_attempts (submitted_at);

CREATE TABLE user_answers (
    id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    selected_option_id BIGINT,
    text_response TEXT,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_user_answers_attempt FOREIGN KEY (attempt_id) REFERENCES user_attempts (id),
    CONSTRAINT fk_user_answers_question FOREIGN KEY (question_id) REFERENCES questions (id),
    CONSTRAINT fk_user_answers_selected_option FOREIGN KEY (selected_option_id) REFERENCES answer_options (id),
    CONSTRAINT uk_user_answers_attempt_question UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_user_answers_attempt_id ON user_answers (attempt_id);
CREATE INDEX idx_user_answers_question_id ON user_answers (question_id);
CREATE INDEX idx_user_answers_selected_option_id ON user_answers (selected_option_id);
CREATE INDEX idx_user_answers_is_correct ON user_answers (is_correct);

CREATE TABLE draft_answers (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    test_id BIGINT NOT NULL,
    payload JSON NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_draft_answers_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_draft_answers_test FOREIGN KEY (test_id) REFERENCES tests (id),
    CONSTRAINT uk_draft_answers_user_test UNIQUE (user_id, test_id)
);

CREATE INDEX idx_draft_answers_user_id ON draft_answers (user_id);
CREATE INDEX idx_draft_answers_test_id ON draft_answers (test_id);
CREATE INDEX idx_draft_answers_updated_at ON draft_answers (updated_at);
