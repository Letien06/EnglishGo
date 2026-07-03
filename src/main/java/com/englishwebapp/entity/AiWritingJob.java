package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class AiWritingJob {

    private Long id;

    private User user;

    private String prompt;

    private String responseText;

    private String feedback;

    private String status = "QUEUED";

    private Instant createdAt;

    private Instant completedAt;
}
