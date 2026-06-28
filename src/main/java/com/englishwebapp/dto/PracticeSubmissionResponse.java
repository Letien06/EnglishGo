package com.englishwebapp.dto;

import java.math.BigDecimal;

public record PracticeSubmissionResponse(
        Long attemptId,
        BigDecimal score,
        int correctCount,
        int questionCount) {
}
