package com.englishwebapp.repository;

import com.englishwebapp.entity.AiWritingJob;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiWritingJobRepository extends JpaRepository<AiWritingJob, Long> {

    List<AiWritingJob> findTop20ByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<AiWritingJob> findByIdAndUserId(Long id, Long userId);
}
