package com.englishwebapp.dto;

import jakarta.validation.constraints.NotBlank;

public record DraftAnswerRequest(@NotBlank String payload) {
}
