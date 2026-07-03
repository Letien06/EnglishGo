package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class DraftAnswer {

    private Long id;

    private User user;

    private Test test;

    private String payload;

    private Instant updatedAt;
}
