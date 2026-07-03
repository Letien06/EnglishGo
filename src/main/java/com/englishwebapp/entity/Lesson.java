package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Lesson {

    private Long id;

    private String title;

    private String topic;

    private String content;

    private String videoUrl;

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
