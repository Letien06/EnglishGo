package com.englishwebapp.repository;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.VocabWord;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VocabWordRepository extends JpaRepository<VocabWord, Long> {

    List<VocabWord> findBySetIdOrderByIdAsc(Long setId);

    List<VocabWord> findBySetIdAndStatusOrderByIdAsc(Long setId, ContentStatus status);

    Optional<VocabWord> findByIdAndStatus(Long id, ContentStatus status);

    Page<VocabWord> findByStatus(ContentStatus status, Pageable pageable);

    long countBySetId(Long setId);

    long countBySetIdAndStatus(Long setId, ContentStatus status);

    long countByStatus(ContentStatus status);

    @Query("""
            select count(word)
            from VocabWord word
            join word.set vocabSet
            left join vocabSet.folder folder
            where word.status = :status
              and vocabSet.status = :status
              and (
                    vocabSet.createdBy is null
                    or vocabSet.createdBy.id = :userId
                    or folder.publicShared = true
              )
            """)
    long countAccessibleByStatus(@Param("userId") Long userId, @Param("status") ContentStatus status);

    boolean existsBySetIdAndWordIgnoreCaseAndStatus(Long setId, String word, ContentStatus status);
}
