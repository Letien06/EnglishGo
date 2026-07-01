package com.englishwebapp.dto;

import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record QuestionGroupRequest(
        @NotNull SkillType skillType,
        @NotNull ToeicPart part,
        @NotBlank String title,
        @Min(1) @Max(5) Integer difficultyLevel,
        String passageHtml,
        String audioUrl,
        String imageUrl) {
}
