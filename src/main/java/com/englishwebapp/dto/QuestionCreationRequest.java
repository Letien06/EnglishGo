package com.englishwebapp.dto;

import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.ToeicPart;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record QuestionCreationRequest(
        @NotNull SkillType skillType,
        @NotNull ToeicPart part,
        @Min(1) @Max(5) int difficultyLevel,
        Long groupId,
        @NotBlank String content,
        String audioUrl,
        String imageUrl,
        String explanation,
        @Valid List<AnswerRequest> answers) {
}
