package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class VocabWord {

    private Long id;

    private VocabSet set;

    private String word;

    private String meaning;

    private String partOfSpeech;

    private String phonetic;

    private String example;

    private String audioUrl;

    private ContentStatus status = ContentStatus.PUBLISHED;

    private SourceType sourceType = SourceType.MANUAL;

    private String sourceNote;

    private String licenseNote;

    private User reviewedBy;

    private Instant reviewedAt;

    private Instant publishedAt;

    private Instant updatedAt;

    private Instant deletedAt;
}
