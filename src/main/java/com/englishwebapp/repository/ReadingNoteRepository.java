package com.englishwebapp.repository;

import com.englishwebapp.entity.ReadingNote;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReadingNoteRepository extends JpaRepository<ReadingNote, Long> {

    Optional<ReadingNote> findByUserIdAndItemId(Long userId, String itemId);
}
