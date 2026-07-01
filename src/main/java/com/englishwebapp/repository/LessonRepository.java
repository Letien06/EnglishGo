package com.englishwebapp.repository;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Lesson;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface LessonRepository extends JpaRepository<Lesson, Long> {

    Page<Lesson> findByTopicContainingIgnoreCase(String topic, Pageable pageable);

    Page<Lesson> findByStatus(ContentStatus status, Pageable pageable);

    Page<Lesson> findByTopicContainingIgnoreCaseAndStatus(String topic, ContentStatus status, Pageable pageable);

    Optional<Lesson> findByIdAndStatus(Long id, ContentStatus status);

    long countByStatus(ContentStatus status);
}
