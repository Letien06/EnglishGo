package com.englishwebapp.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class UserAnswer {

    private Long id;

    private UserAttempt attempt;

    private Question question;

    private AnswerOption selectedOption;

    private String textResponse;

    private Boolean correct = false;
}
