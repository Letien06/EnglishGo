package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Comment {

    private Long id;

    private User user;

    private String targetType;

    private Long targetId;

    private String content;

    private Instant createdAt;

    private Instant deletedAt;
}
