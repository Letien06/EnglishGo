package com.englishwebapp.dto;

import com.englishwebapp.entity.VocabProgressStatus;
import java.time.Instant;

public record VocabReviewResponse(
        VocabProgressStatus status,
        int interval,
        int repetitions,
        double easeFactor,
        Instant nextReviewAt) {
}
