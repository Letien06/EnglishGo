package com.englishwebapp.repository;

import com.englishwebapp.entity.ReadingFavorite;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReadingFavoriteRepository extends JpaRepository<ReadingFavorite, Long> {

    Optional<ReadingFavorite> findByUserIdAndItemId(Long userId, String itemId);
}
