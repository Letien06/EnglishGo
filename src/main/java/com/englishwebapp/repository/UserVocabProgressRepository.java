package com.englishwebapp.repository;

import com.englishwebapp.entity.UserVocabProgress;
import com.englishwebapp.entity.VocabProgressStatus;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserVocabProgressRepository extends JpaRepository<UserVocabProgress, Long> {

    Optional<UserVocabProgress> findByUserIdAndWordId(Long userId, Long wordId);

    long countByUserIdAndStatus(Long userId, VocabProgressStatus status);
}
