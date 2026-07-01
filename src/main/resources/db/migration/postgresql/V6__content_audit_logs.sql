CREATE TABLE content_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id BIGINT,
    target_type VARCHAR(60) NOT NULL,
    target_id BIGINT NOT NULL,
    action VARCHAR(60) NOT NULL,
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    note TEXT,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_content_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id)
);

CREATE INDEX idx_content_audit_logs_actor_id ON content_audit_logs (actor_id);
CREATE INDEX idx_content_audit_logs_target ON content_audit_logs (target_type, target_id);
CREATE INDEX idx_content_audit_logs_action ON content_audit_logs (action);
CREATE INDEX idx_content_audit_logs_created_at ON content_audit_logs (created_at);
