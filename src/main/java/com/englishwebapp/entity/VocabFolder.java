package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class VocabFolder {

    private Long id;

    private User user;

    private String name;

    private boolean publicShared;

    private Instant sharedAt;

    private Instant createdAt;

    private Instant updatedAt;

    private Instant deletedAt;
}
