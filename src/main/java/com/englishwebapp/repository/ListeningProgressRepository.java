package com.englishwebapp.repository;

import com.englishwebapp.entity.ListeningProgress;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface ListeningProgressRepository extends JpaRepository<ListeningProgress, Long> {

    Optional<ListeningProgress> findByUserIdAndQuestionId(Long userId, String questionId);

    List<ListeningProgress> findByUserIdAndPartAndLevel(Long userId, Integer part, Integer level);

    @Transactional
    void deleteByUserIdAndPartAndLevel(Long userId, Integer part, Integer level);
}
