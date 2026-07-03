package com.englishwebapp.entity;

import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class Subscription {

    private Long id;

    private User user;

    private String planId;

    private LocalDate startDate;

    private LocalDate endDate;

    private String status;
}
