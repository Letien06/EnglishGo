package com.englishwebapp.dto;

import java.util.List;

public record DauToeicPracticeItemResponse(
        String id,
        String itemType,
        Integer part,
        Integer level,
        Double errorRate,
        Integer totalAttempts,
        Integer wrongCount,
        String audioUrl,
        String imageUrl,
        String transcript,
        String translation,
        String vocabulary,
        List<DauToeicQuestionResponse> questions) {
}
