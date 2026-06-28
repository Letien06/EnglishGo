package com.englishwebapp.repository;

import com.englishwebapp.entity.UserAttempt;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAttemptRepository extends JpaRepository<UserAttempt, Long> {

    @EntityGraph(attributePaths = {"test"})
    Page<UserAttempt> findByUserIdAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(Long userId, Pageable pageable);

    @EntityGraph(attributePaths = {"test", "user"})
    Optional<UserAttempt> findByIdAndUserId(Long id, Long userId);

    long countByUserIdAndSubmittedAtIsNotNull(Long userId);

    @Query("""
            select coalesce(avg(attempt.score), 0)
            from UserAttempt attempt
            where attempt.user.id = :userId
              and attempt.submittedAt is not null
              and attempt.score is not null
            """)
    Double findAverageScoreByUserId(@Param("userId") Long userId);

    List<UserAttempt> findTop7ByUserIdAndSubmittedAtIsNotNullOrderBySubmittedAtDesc(Long userId);
}
