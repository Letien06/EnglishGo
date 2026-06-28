package com.englishwebapp.repository;

import com.englishwebapp.entity.Lesson;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LessonRepository extends JpaRepository<Lesson, Long> {

    Page<Lesson> findByTopicContainingIgnoreCase(String topic, Pageable pageable);
}
