package com.englishwebapp.repository;

import com.englishwebapp.entity.ReadingProgress;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface ReadingProgressRepository extends JpaRepository<ReadingProgress, Long> {

    Optional<ReadingProgress> findByUserIdAndQuestionId(Long userId, String questionId);

    List<ReadingProgress> findByUserIdAndPartAndLevel(Long userId, Integer part, Integer level);

    @Transactional
    void deleteByUserIdAndPartAndLevel(Long userId, Integer part, Integer level);
}
