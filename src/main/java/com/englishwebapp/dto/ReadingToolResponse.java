package com.englishwebapp.dto;

public record ReadingToolResponse(
        boolean saved,
        boolean authenticated,
        Boolean favorite,
        String message) {
}
