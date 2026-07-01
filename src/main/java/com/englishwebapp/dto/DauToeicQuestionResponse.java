package com.englishwebapp.dto;

public record DauToeicQuestionResponse(
        String id,
        String testId,
        String passageId,
        Integer part,
        String section,
        Integer questionNumber,
        String audioUrl,
        String imageUrl,
        String passageText,
        String questionText,
        String optionA,
        String optionB,
        String optionC,
        String optionD,
        String correctAnswer,
        String explanationVi,
        String explanationEn,
        Integer difficultyLevel,
        Integer orderIndex,
        String translationVi,
        String vocabulary,
        String answerTranslationVi) {
}
