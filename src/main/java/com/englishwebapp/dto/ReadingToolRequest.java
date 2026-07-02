package com.englishwebapp.dto;

public record ReadingToolRequest(
        Integer part,
        Integer level,
        String itemId,
        String questionId,
        String note,
        String word,
        String meaning,
        String example,
        Boolean favorite) {
}
