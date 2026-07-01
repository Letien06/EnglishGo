package com.englishwebapp.dto;

public record DauToeicTestResponse(
        String id,
        String setId,
        String setName,
        String name,
        String description,
        String source,
        Integer year,
        Integer difficultyLevel,
        Integer totalQuestions,
        Integer listeningDurationSeconds,
        Integer readingDurationSeconds,
        Boolean free,
        Boolean hidden,
        Integer orderIndex,
        String mediaFolder,
        Integer mediaVersion) {
}
