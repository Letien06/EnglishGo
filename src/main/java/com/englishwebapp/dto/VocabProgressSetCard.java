package com.englishwebapp.dto;

import java.time.Instant;

public record VocabProgressSetCard(
        Long id,
        String title,
        String topic,
        String icon,
        String sourceLabel,
        long totalWords,
        long learnedWords,
        long learningWords,
        long masteredWords,
        long dueWords,
        int masteredPercent,
        Instant lastReviewedAt) {
}
