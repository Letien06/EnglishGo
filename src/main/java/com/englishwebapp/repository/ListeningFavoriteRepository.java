package com.englishwebapp.repository;

import com.englishwebapp.entity.ListeningFavorite;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ListeningFavoriteRepository extends JpaRepository<ListeningFavorite, Long> {

    Optional<ListeningFavorite> findByUserIdAndItemId(Long userId, String itemId);
}
