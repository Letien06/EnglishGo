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
@Table(name = "listening_vocab_basket")
public class ListeningVocabBasket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "item_id", nullable = false, length = 80)
    private String itemId;

    @Column(name = "question_id", length = 80)
    private String questionId;

    @Column(nullable = false, length = 150)
    private String word;

    @Column(length = 500)
    private String meaning;

    @Column(length = 1000)
    private String example;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
