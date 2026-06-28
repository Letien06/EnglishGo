package com.englishwebapp.dto;

import jakarta.validation.constraints.NotBlank;

public record FirebaseLoginRequest(@NotBlank String idToken) {
}
