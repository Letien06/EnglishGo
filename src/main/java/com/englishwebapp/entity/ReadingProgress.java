package com.englishwebapp.entity;

import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class ReadingProgress {

    private Long id;

    private User user;

    private String source = "DAUTOEIC";

    private Integer part;

    private Integer level;

    private String itemId;

    private String questionId;

    private String selectedAnswer;

    private String correctAnswer;

    private boolean correct;

    private String modeUsed = "normal";

    private Integer assistPercent = 30;

    private Integer elapsedSeconds = 0;

    private Integer score = 0;

    private Instant completedAt;
}
