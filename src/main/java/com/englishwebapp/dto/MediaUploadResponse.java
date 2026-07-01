package com.englishwebapp.dto;

import com.englishwebapp.entity.MediaType;

public record MediaUploadResponse(
        Long id,
        MediaType mediaType,
        String originalFilename,
        String publicUrl,
        String contentType,
        long sizeBytes) {
}
