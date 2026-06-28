package com.englishwebapp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "user_vocab_progress")
public class UserVocabProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "word_id", nullable = false)
    private VocabWord word;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private VocabProgressStatus status = VocabProgressStatus.NEW;

    @Column(name = "`interval`", nullable = false)
    private Integer interval = 0;

    @Column(name = "ease_factor", nullable = false, precision = 4, scale = 2)
    private BigDecimal easeFactor = BigDecimal.valueOf(2.50);

    @Column(nullable = false)
    private Integer repetitions = 0;

    @Column(name = "next_review_at")
    private Instant nextReviewAt;

    @Column(name = "last_reviewed_at")
    private Instant lastReviewedAt;
}
