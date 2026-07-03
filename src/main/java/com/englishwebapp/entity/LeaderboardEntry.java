package com.englishwebapp.entity;

import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class LeaderboardEntry {

    private Long id;

    private User user;

    private BigDecimal score;

    private Integer rankPosition;

    private String period = "ALL_TIME";

    private Instant updatedAt;
}
