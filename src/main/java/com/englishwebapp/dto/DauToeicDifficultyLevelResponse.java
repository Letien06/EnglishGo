package com.englishwebapp.dto;

public record DauToeicDifficultyLevelResponse(
        Integer part,
        Integer level,
        String title,
        Double errorRateMin,
        Double errorRateMax,
        Integer total,
        Integer done,
        Integer correct,
        Integer wrong,
        Integer remaining,
        Integer totalAttempts,
        Integer wrongAttempts) {
}
