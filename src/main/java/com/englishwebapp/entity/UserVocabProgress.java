package com.englishwebapp.entity;

import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class UserVocabProgress {

    private Long id;

    private User user;

    private VocabWord word;

    private VocabProgressStatus status = VocabProgressStatus.NEW;

    private Integer interval = 0;

    private BigDecimal easeFactor = BigDecimal.valueOf(2.50);

    private Integer repetitions = 0;

    private Instant nextReviewAt;

    private Instant lastReviewedAt;
}
