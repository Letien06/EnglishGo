package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AnswerOption {

    private Long id;

    private Question question;

    private String content;

    private Boolean correct = false;

    private Instant createdAt;
}
