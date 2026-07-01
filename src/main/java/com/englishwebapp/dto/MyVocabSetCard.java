package com.englishwebapp.dto;

public record MyVocabSetCard(
        Long id,
        String title,
        String description,
        String icon,
        Long folderId,
        String folderName,
        long wordCount,
        long masteredCount,
        int progressPercent) {
}
