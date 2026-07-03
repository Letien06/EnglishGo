package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class QuestionGroup {

    private Long id;

    private Test test;

    private SkillType skillType = SkillType.READING;

    private Integer part = 6;

    private String title = "Question group";

    private String passageText;

    private String passageHtml;

    private String audioUrl;

    private String imageUrl;

    private Integer difficultyLevel;

    private ContentStatus status = ContentStatus.DRAFT;

    private Instant createdAt;

    private Instant updatedAt;

    private Instant publishedAt;

    private Instant deletedAt;
}
