package com.englishwebapp.dto;

public record VocabWordCard(
        Long id,
        String word,
        String meaning,
        String phonetic,
        String example,
        String audioUrl) {
}
