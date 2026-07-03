package com.englishwebapp.dto;

import com.englishwebapp.entity.User;

public record AuthenticatedUserResponse(
        String uid,
        String email,
        String displayName,
        String role) {

    public static AuthenticatedUserResponse from(User user) {
        return new AuthenticatedUserResponse(
                user.getFirebaseUid(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole().name());
    }
}
