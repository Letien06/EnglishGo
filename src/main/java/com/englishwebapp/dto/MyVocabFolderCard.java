package com.englishwebapp.dto;

public record MyVocabFolderCard(
        Long id,
        String name,
        long setCount,
        long wordCount,
        boolean publicShared) {
}
