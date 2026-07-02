ALTER TABLE question_groups
    MODIFY COLUMN test_id BIGINT NULL,
    ADD COLUMN skill_type VARCHAR(30) NOT NULL DEFAULT 'READING',
    ADD COLUMN part INT NOT NULL DEFAULT 6,
    ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT 'Question group',
    ADD COLUMN passage_html TEXT NULL,
    ADD COLUMN difficulty_level INT NULL,
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    ADD COLUMN published_at TIMESTAMP(6) NULL,
    ADD COLUMN deleted_at TIMESTAMP(6) NULL,
    ADD INDEX idx_question_groups_skill_part_status (skill_type, part, status),
    ADD INDEX idx_question_groups_deleted_at (deleted_at);

ALTER TABLE questions
    MODIFY COLUMN test_id BIGINT NULL,
    ADD COLUMN skill_type VARCHAR(30) NOT NULL DEFAULT 'READING',
    ADD COLUMN difficulty_level INT NOT NULL DEFAULT 3,
    ADD COLUMN created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ADD INDEX idx_questions_skill_part_status (skill_type, part, status),
    ADD INDEX idx_questions_difficulty_level (difficulty_level);

ALTER TABLE answer_options
    ADD COLUMN created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

CREATE TABLE media_assets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    public_url VARCHAR(512) NOT NULL,
    media_type VARCHAR(30) NOT NULL,
    uploaded_by BIGINT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_media_assets_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id),
    INDEX idx_media_assets_media_type (media_type),
    INDEX idx_media_assets_uploaded_by (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
