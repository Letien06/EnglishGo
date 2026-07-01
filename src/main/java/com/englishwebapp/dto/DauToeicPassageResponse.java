package com.englishwebapp.dto;

public record DauToeicPassageResponse(
        String id,
        String testId,
        Integer part,
        String passageType,
        String audioUrl,
        String imageUrl,
        String passageText,
        String passageText2,
        String passageText3,
        String transcript,
        Integer orderIndex,
        String title) {
}
