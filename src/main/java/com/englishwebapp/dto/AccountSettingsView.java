package com.englishwebapp.dto;

public record AccountSettingsView(
        String email,
        String role,
        AccountSettingsForm form) {
}
