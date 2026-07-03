package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class TestQuestion {

    private Long id;

    private Test test;

    private Question question;

    private Integer displayOrder;

    private Instant createdAt;
}
