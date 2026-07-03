package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ListeningVocabBasket {

    private Long id;

    private User user;

    private String itemId;

    private String questionId;

    private String word;

    private String meaning;

    private String example;

    private Instant createdAt;
}
