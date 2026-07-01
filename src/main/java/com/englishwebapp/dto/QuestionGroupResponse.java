package com.englishwebapp.dto;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import java.time.Instant;

public record QuestionGroupResponse(
        Long id,
        SkillType skillType,
        ToeicPart part,
        String title,
        Integer difficultyLevel,
        String passageHtml,
        String audioUrl,
        String imageUrl,
        ContentStatus status,
        long questionCount,
        Instant createdAt,
        Instant publishedAt) {
}
