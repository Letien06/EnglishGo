package com.englishwebapp.dto;

public record VocabSetCard(
        Long id,
        String title,
        String topic,
        String level,
        long wordCount,
        boolean premium) {
}
