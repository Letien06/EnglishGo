package com.englishwebapp.dto;

public record ListeningToolResponse(
        boolean saved,
        boolean authenticated,
        Boolean favorite,
        String message) {
}
