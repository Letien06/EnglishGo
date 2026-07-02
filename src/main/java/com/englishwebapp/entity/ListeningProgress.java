package com.englishwebapp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "listening_progress")
public class ListeningProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 30)
    private String source = "DAUTOEIC";

    @Column(nullable = false)
    private Integer part;

    @Column(nullable = false)
    private Integer level;

    @Column(name = "item_id", nullable = false, length = 80)
    private String itemId;

    @Column(name = "question_id", nullable = false, length = 80)
    private String questionId;

    @Column(name = "selected_answer", length = 10)
    private String selectedAnswer;

    @Column(name = "correct_answer", length = 10)
    private String correctAnswer;

    @Column(name = "is_correct", nullable = false)
    private boolean correct;

    @Column(name = "mode_used", nullable = false, length = 30)
    private String modeUsed = "normal";

    @Column(name = "assist_percent", nullable = false)
    private Integer assistPercent = 30;

    @Column(name = "replay_count", nullable = false)
    private Integer replayCount = 0;

    @Column(name = "elapsed_seconds", nullable = false)
    private Integer elapsedSeconds = 0;

    @Column(name = "score", nullable = false)
    private Integer score = 0;

    @Column(name = "completed_at", nullable = false)
    private Instant completedAt;
}
