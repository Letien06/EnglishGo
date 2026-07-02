package com.englishwebapp.dto;

public record ReadingProgressResponse(
        boolean saved,
        boolean authenticated,
        boolean correct) {
}
