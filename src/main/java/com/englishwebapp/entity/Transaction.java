package com.englishwebapp.entity;

import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Transaction {

    private Long id;

    private User user;

    private BigDecimal amount;

    private String provider;

    private String status;

    private Instant createdAt;
}
