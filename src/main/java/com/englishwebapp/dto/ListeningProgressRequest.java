package com.englishwebapp.dto;

public record ListeningProgressRequest(
        Integer part,
        Integer level,
        String itemId,
        String questionId,
        String selectedAnswer,
        String correctAnswer,
        String modeUsed,
        Integer assistPercent,
        Integer replayCount) {
}
