package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class MediaAsset {

    private Long id;

    private String originalFileName;

    private String storedFileName;

    private String contentType;

    private Long fileSize;

    private String storagePath;

    private String publicUrl;

    private MediaType mediaType;

    private User uploadedBy;

    private Instant createdAt;
}
