package com.englishwebapp.repository;

import com.englishwebapp.entity.DraftAnswer;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DraftAnswerRepository extends JpaRepository<DraftAnswer, Long> {

    Optional<DraftAnswer> findByUserIdAndTestId(Long userId, Long testId);

    void deleteByUserIdAndTestId(Long userId, Long testId);
}
