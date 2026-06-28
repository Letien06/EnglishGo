package com.englishwebapp.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
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
@Table(name = "vocab_sets")
@SQLDelete(sql = "UPDATE vocab_sets SET deleted_at = CURRENT_TIMESTAMP(6) WHERE id = ?")
@Where(clause = "deleted_at IS NULL")
public class VocabSet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, length = 100)
    private String topic;

    @Column(length = 50)
    private String level;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
