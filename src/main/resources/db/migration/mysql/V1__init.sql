CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    firebase_uid VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(150) NULL,
    avatar_url VARCHAR(512) NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'STUDENT',
    level VARCHAR(50) NULL,
    target_score INT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_users_firebase_uid UNIQUE (firebase_uid),
    CONSTRAINT uk_users_email UNIQUE (email),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tests (
    id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    duration INT NOT NULL,
    difficulty VARCHAR(50) NULL,
    version INT NOT NULL DEFAULT 1,
    created_by BIGINT NOT NULL,
    deleted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_tests_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    INDEX idx_tests_type (type),
    INDEX idx_tests_difficulty (difficulty),
    INDEX idx_tests_created_by (created_by),
    INDEX idx_tests_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE question_groups (
    id BIGINT NOT NULL AUTO_INCREMENT,
    test_id BIGINT NOT NULL,
    passage_text TEXT NULL,
    audio_url VARCHAR(512) NULL,
    image_url VARCHAR(512) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_question_groups_test FOREIGN KEY (test_id) REFERENCES tests (id),
    INDEX idx_question_groups_test_id (test_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    test_id BIGINT NOT NULL,
    group_id BIGINT NULL,
    part INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    audio_url VARCHAR(512) NULL,
    image_url VARCHAR(512) NULL,
    explanation TEXT NULL,
    deleted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_questions_test FOREIGN KEY (test_id) REFERENCES tests (id),
    CONSTRAINT fk_questions_group FOREIGN KEY (group_id) REFERENCES question_groups (id),
    INDEX idx_questions_test_id (test_id),
    INDEX idx_questions_group_id (group_id),
    INDEX idx_questions_part (part),
    INDEX idx_questions_type (type),
    INDEX idx_questions_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE answer_options (
    id BIGINT NOT NULL AUTO_INCREMENT,
    question_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT fk_answer_options_question FOREIGN KEY (question_id) REFERENCES questions (id),
    INDEX idx_answer_options_question_id (question_id),
    INDEX idx_answer_options_is_correct (is_correct)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE accepted_answers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    question_id BIGINT NOT NULL,
    answer_text VARCHAR(1000) NOT NULL,
    case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT fk_accepted_answers_question FOREIGN KEY (question_id) REFERENCES questions (id),
    INDEX idx_accepted_answers_question_id (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_attempts (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    test_id BIGINT NOT NULL,
    score DECIMAL(6,2) NULL,
    started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    submitted_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_user_attempts_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_user_attempts_test FOREIGN KEY (test_id) REFERENCES tests (id),
    INDEX idx_user_attempts_user_id (user_id),
    INDEX idx_user_attempts_test_id (test_id),
    INDEX idx_user_attempts_submitted_at (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_answers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    attempt_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    selected_option_id BIGINT NULL,
    text_response TEXT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT fk_user_answers_attempt FOREIGN KEY (attempt_id) REFERENCES user_attempts (id),
    CONSTRAINT fk_user_answers_question FOREIGN KEY (question_id) REFERENCES questions (id),
    CONSTRAINT fk_user_answers_selected_option FOREIGN KEY (selected_option_id) REFERENCES answer_options (id),
    CONSTRAINT uk_user_answers_attempt_question UNIQUE (attempt_id, question_id),
    INDEX idx_user_answers_attempt_id (attempt_id),
    INDEX idx_user_answers_question_id (question_id),
    INDEX idx_user_answers_selected_option_id (selected_option_id),
    INDEX idx_user_answers_is_correct (is_correct)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE draft_answers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    test_id BIGINT NOT NULL,
    payload JSON NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_draft_answers_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_draft_answers_test FOREIGN KEY (test_id) REFERENCES tests (id),
    CONSTRAINT uk_draft_answers_user_test UNIQUE (user_id, test_id),
    INDEX idx_draft_answers_user_id (user_id),
    INDEX idx_draft_answers_test_id (test_id),
    INDEX idx_draft_answers_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
