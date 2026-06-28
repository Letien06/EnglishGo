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
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.Where;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "vocab_words")
@SQLDelete(sql = "UPDATE vocab_words SET deleted_at = CURRENT_TIMESTAMP(6) WHERE id = ?")
@Where(clause = "deleted_at IS NULL")
public class VocabWord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "set_id", nullable = false)
    private VocabSet set;

    @Column(nullable = false, length = 150)
    private String word;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String meaning;

    @Column(length = 150)
    private String phonetic;

    @Column(columnDefinition = "TEXT")
    private String example;

    @Column(name = "audio_url", length = 512)
    private String audioUrl;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
