package com.englishwebapp.dto;

public record CommunityVocabFolderCard(
        Long id,
        String name,
        String ownerName,
        long setCount,
        long wordCount) {
}
