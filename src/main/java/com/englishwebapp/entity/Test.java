package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Test {

    private Long id;

    private String title;

    private String type;

    private Integer duration;

    private String difficulty;

    private Integer version = 1;

    private User createdBy;

    private ContentStatus status = ContentStatus.PUBLISHED;

    private SourceType sourceType = SourceType.MANUAL;

    private String sourceNote;

    private String licenseNote;

    private User reviewedBy;

    private Instant reviewedAt;

    private Instant publishedAt;

    private Instant updatedAt;

    private Instant deletedAt;
}
