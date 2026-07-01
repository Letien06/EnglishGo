package com.englishwebapp.repository;

import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.ContentStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import java.util.Optional;

public interface TestRepository extends JpaRepository<Test, Long>, JpaSpecificationExecutor<Test> {

    Page<Test> findByStatus(ContentStatus status, Pageable pageable);

    Optional<Test> findByIdAndStatus(Long id, ContentStatus status);

    long countByStatus(ContentStatus status);
}
