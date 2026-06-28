package com.englishwebapp.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record VocabReviewRequest(@Min(0) @Max(5) int quality) {
}
