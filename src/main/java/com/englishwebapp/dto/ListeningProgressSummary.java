package com.englishwebapp.dto;

public record ListeningProgressSummary(
        Integer part,
        Integer level,
        Integer done,
        Integer correct,
        Integer wrong) {
}
