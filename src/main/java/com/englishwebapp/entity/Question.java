package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Question {

    private Long id;

    private Test test;

    private QuestionGroup group;

    private Integer part;

    private SkillType skillType = SkillType.READING;

    private Integer difficultyLevel = 3;

    private String type;

    private String content;

    private String audioUrl;

    private String imageUrl;

    private String explanation;

    private ContentStatus status = ContentStatus.DRAFT;

    private SourceType sourceType = SourceType.MANUAL;

    private String sourceNote;

    private String licenseNote;

    private User reviewedBy;

    private Instant reviewedAt;

    private Instant publishedAt;

    private Instant createdAt;

    private Instant updatedAt;

    private Instant deletedAt;
}
