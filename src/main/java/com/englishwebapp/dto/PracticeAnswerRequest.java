package com.englishwebapp.dto;

import jakarta.validation.constraints.NotNull;

public record PracticeAnswerRequest(
        @NotNull Long questionId,
        Long selectedOptionId,
        String textResponse) {
}
