package com.englishwebapp.repository;

import com.englishwebapp.entity.UserAttempt;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAttemptRepository extends JpaRepository<UserAttempt, Long> {

    @EntityGraph(attributePaths = {"test"})
    Page<UserAttempt> findByUserIdAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(Long userId, Pageable pageable);

    @EntityGraph(attributePaths = {"test", "user"})
    Optional<UserAttempt> findByIdAndUserId(Long id, Long userId);
}
