package com.englishwebapp.dto;

public record ListenPartView(
        String id,
        String label,
        String title,
        String shortDescription,
        String icon,
        boolean active) {
}
