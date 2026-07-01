package com.englishwebapp.dto;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import java.time.Instant;
import java.util.List;

public record QuestionDetailResponse(
        Long id,
        SkillType skillType,
        ToeicPart part,
        int difficultyLevel,
        Long groupId,
        String groupTitle,
        String content,
        String audioUrl,
        String imageUrl,
        String explanation,
        ContentStatus status,
        Instant createdAt,
        Instant publishedAt,
        List<AnswerResponse> answers) {
}
