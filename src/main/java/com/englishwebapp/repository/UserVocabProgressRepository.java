package com.englishwebapp.repository;

import com.englishwebapp.entity.UserVocabProgress;
import com.englishwebapp.entity.VocabProgressStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;

public interface UserVocabProgressRepository extends JpaRepository<UserVocabProgress, Long> {

    Optional<UserVocabProgress> findByUserIdAndWordId(Long userId, Long wordId);

    long countByUserIdAndStatus(Long userId, VocabProgressStatus status);

    long countByUserId(Long userId);

    long countByUserIdAndNextReviewAtLessThanEqual(Long userId, Instant nextReviewAt);

    long countByUserIdAndLastReviewedAtGreaterThanEqual(Long userId, Instant lastReviewedAt);

    @Query("""
            select count(progress)
            from UserVocabProgress progress
            where progress.user.id = :userId
              and progress.word.set.id = :setId
            """)
    long countByUserIdAndSetId(@Param("userId") Long userId, @Param("setId") Long setId);

    @Query("""
            select count(progress)
            from UserVocabProgress progress
            where progress.user.id = :userId
              and progress.word.set.id = :setId
              and progress.status = :status
            """)
    long countByUserIdAndSetIdAndStatus(
            @Param("userId") Long userId,
            @Param("setId") Long setId,
            @Param("status") VocabProgressStatus status);

    @Query("""
            select count(progress)
            from UserVocabProgress progress
            where progress.user.id = :userId
              and progress.word.set.id = :setId
              and progress.nextReviewAt <= :now
            """)
    long countDueByUserIdAndSetId(
            @Param("userId") Long userId,
            @Param("setId") Long setId,
            @Param("now") Instant now);

    @Query("""
            select max(progress.lastReviewedAt)
            from UserVocabProgress progress
            where progress.user.id = :userId
              and progress.word.set.id = :setId
            """)
    Instant findLastReviewedAtByUserIdAndSetId(@Param("userId") Long userId, @Param("setId") Long setId);

    @EntityGraph(attributePaths = {"word"})
    @Query("""
            select progress
            from UserVocabProgress progress
            where progress.user.id = :userId
              and progress.word.set.id = :setId
            """)
    List<UserVocabProgress> findByUserIdAndSetId(@Param("userId") Long userId, @Param("setId") Long setId);

    @EntityGraph(attributePaths = {"word", "word.set"})
    List<UserVocabProgress> findByUserIdAndNextReviewAtLessThanEqualOrderByNextReviewAtAsc(
            Long userId,
            Instant nextReviewAt,
            Pageable pageable);
}
