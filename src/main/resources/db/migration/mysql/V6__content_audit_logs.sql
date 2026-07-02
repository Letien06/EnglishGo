CREATE TABLE content_audit_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    actor_id BIGINT NULL,
    target_type VARCHAR(60) NOT NULL,
    target_id BIGINT NOT NULL,
    action VARCHAR(60) NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NULL,
    note TEXT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_content_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id),
    INDEX idx_content_audit_logs_actor_id (actor_id),
    INDEX idx_content_audit_logs_target (target_type, target_id),
    INDEX idx_content_audit_logs_action (action),
    INDEX idx_content_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
