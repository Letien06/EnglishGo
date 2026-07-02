package com.englishwebapp.dto;

public record ReadingProgressSummary(
        Integer part,
        Integer level,
        Integer done,
        Integer correct,
        Integer wrong) {
}
