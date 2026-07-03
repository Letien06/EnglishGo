package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class User {

    private Long id;

    private String firebaseUid;

    private String email;

    private String displayName;

    private String avatarUrl;

    private UserRole role = UserRole.STUDENT;

    private String level;

    private Integer targetScore;

    private Instant createdAt;
}
