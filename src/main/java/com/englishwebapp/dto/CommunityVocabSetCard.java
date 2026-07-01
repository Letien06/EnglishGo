package com.englishwebapp.dto;

public record CommunityVocabSetCard(
        Long id,
        String title,
        String description,
        String icon,
        long wordCount) {
}
