package com.englishwebapp.repository;

import com.englishwebapp.entity.ListeningNote;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ListeningNoteRepository extends JpaRepository<ListeningNote, Long> {

    Optional<ListeningNote> findByUserIdAndItemId(Long userId, String itemId);
}
