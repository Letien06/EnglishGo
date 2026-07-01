package com.englishwebapp.dto;

public record AnswerResponse(
        Long id,
        String content,
        boolean correct) {
}
