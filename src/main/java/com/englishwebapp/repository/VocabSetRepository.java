package com.englishwebapp.repository;

import com.englishwebapp.entity.VocabSet;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VocabSetRepository extends JpaRepository<VocabSet, Long> {

    Page<VocabSet> findByTopicContainingIgnoreCase(String topic, Pageable pageable);
}
