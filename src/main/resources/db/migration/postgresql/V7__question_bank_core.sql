ALTER TABLE question_groups
    ALTER COLUMN test_id DROP NOT NULL,
    ADD COLUMN skill_type VARCHAR(30) NOT NULL DEFAULT 'READING',
    ADD COLUMN part INT NOT NULL DEFAULT 6,
    ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT 'Question group',
    ADD COLUMN passage_html TEXT,
    ADD COLUMN difficulty_level INT,
    ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN published_at TIMESTAMP(6),
    ADD COLUMN deleted_at TIMESTAMP(6);

CREATE INDEX idx_question_groups_skill_part_status ON question_groups (skill_type, part, status);
CREATE INDEX idx_question_groups_deleted_at ON question_groups (deleted_at);

ALTER TABLE questions
    ALTER COLUMN test_id DROP NOT NULL,
    ADD COLUMN skill_type VARCHAR(30) NOT NULL DEFAULT 'READING',
    ADD COLUMN difficulty_level INT NOT NULL DEFAULT 3,
    ADD COLUMN created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_questions_skill_part_status ON questions (skill_type, part, status);
CREATE INDEX idx_questions_difficulty_level ON questions (difficulty_level);

ALTER TABLE answer_options
    ADD COLUMN created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE media_assets (
    id BIGSERIAL PRIMARY KEY,
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    public_url VARCHAR(512) NOT NULL,
    media_type VARCHAR(30) NOT NULL,
    uploaded_by BIGINT,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_media_assets_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id)
);

CREATE INDEX idx_media_assets_media_type ON media_assets (media_type);
CREATE INDEX idx_media_assets_uploaded_by ON media_assets (uploaded_by);
