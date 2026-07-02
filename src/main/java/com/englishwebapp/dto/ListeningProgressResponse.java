package com.englishwebapp.dto;

public record ListeningProgressResponse(
        boolean saved,
        boolean authenticated,
        boolean correct) {
}
