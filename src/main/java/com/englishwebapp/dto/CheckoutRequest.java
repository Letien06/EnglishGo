package com.englishwebapp.dto;

import jakarta.validation.constraints.NotBlank;

public record CheckoutRequest(@NotBlank String planId, @NotBlank String provider) {
}
