package com.englishwebapp.repository;

import com.englishwebapp.entity.ContentAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContentAuditLogRepository extends JpaRepository<ContentAuditLog, Long> {
}
