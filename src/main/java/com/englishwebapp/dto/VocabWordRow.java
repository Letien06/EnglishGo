package com.englishwebapp.dto;

public record VocabWordRow(
        Long id,
        String word,
        String meaning,
        String partOfSpeech,
        String phonetic,
        String example,
        String audioUrl,
        boolean mastered) {
}
