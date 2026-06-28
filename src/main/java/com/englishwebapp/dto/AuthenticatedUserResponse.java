package com.englishwebapp.dto;

import com.englishwebapp.entity.User;

public record AuthenticatedUserResponse(
        Long id,
        String email,
        String displayName,
        String role) {

    public static AuthenticatedUserResponse from(User user) {
        return new AuthenticatedUserResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole().name());
    }
}
