package com.englishwebapp.dto;

import jakarta.validation.constraints.NotBlank;

public record WritingJobRequest(@NotBlank String prompt, @NotBlank String responseText) {
}
