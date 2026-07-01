package com.englishwebapp.dto;

import jakarta.validation.constraints.NotBlank;

public record AnswerRequest(
        @NotBlank String content,
        boolean correct) {
}
