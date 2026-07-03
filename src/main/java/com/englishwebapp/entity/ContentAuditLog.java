package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ContentAuditLog {

    private Long id;

    private User actor;

    private String targetType;

    private Long targetId;

    private String action;

    private String fromStatus;

    private String toStatus;

    private String note;

    private Instant createdAt;
}
