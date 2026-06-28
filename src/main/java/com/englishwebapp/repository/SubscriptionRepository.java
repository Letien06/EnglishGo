package com.englishwebapp.repository;

import com.englishwebapp.entity.Subscription;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    @EntityGraph(attributePaths = {"user"})
    Optional<Subscription> findFirstByUserIdAndStatusOrderByStartDateDesc(Long userId, String status);
}
