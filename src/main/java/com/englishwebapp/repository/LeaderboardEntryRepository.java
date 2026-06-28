package com.englishwebapp.repository;

import com.englishwebapp.entity.LeaderboardEntry;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LeaderboardEntryRepository extends JpaRepository<LeaderboardEntry, Long> {

    @EntityGraph(attributePaths = {"user"})
    List<LeaderboardEntry> findTop20ByPeriodOrderByScoreDesc(String period);

    Optional<LeaderboardEntry> findByUserIdAndPeriod(Long userId, String period);
}
