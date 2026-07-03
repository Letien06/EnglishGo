package com.englishwebapp.entity;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AcceptedAnswer {

    private Long id;

    private Question question;

    private String answerText;

    private Boolean caseSensitive = false;
}
