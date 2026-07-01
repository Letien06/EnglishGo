package com.englishwebapp.repository;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.VocabSet;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VocabSetRepository extends JpaRepository<VocabSet, Long> {

    Page<VocabSet> findByTopicContainingIgnoreCase(String topic, Pageable pageable);

    Page<VocabSet> findByStatus(ContentStatus status, Pageable pageable);

    Page<VocabSet> findByCreatedByIsNullAndStatus(ContentStatus status, Pageable pageable);

    Page<VocabSet> findByTopicContainingIgnoreCaseAndStatus(String topic, ContentStatus status, Pageable pageable);

    Page<VocabSet> findByTopicContainingIgnoreCaseAndCreatedByIsNullAndStatus(String topic, ContentStatus status, Pageable pageable);

    Optional<VocabSet> findByIdAndStatus(Long id, ContentStatus status);

    Optional<VocabSet> findByIdAndCreatedByIdAndStatus(Long id, Long createdById, ContentStatus status);

    List<VocabSet> findByCreatedByIdAndStatusOrderByUpdatedAtDesc(Long createdById, ContentStatus status);

    List<VocabSet> findByCreatedByIdAndFolderIdAndStatusOrderByUpdatedAtDesc(Long createdById, Long folderId, ContentStatus status);

    List<VocabSet> findByFolderIdAndCreatedById(Long folderId, Long createdById);

    List<VocabSet> findByFolderIdAndStatusOrderByUpdatedAtDesc(Long folderId, ContentStatus status);

    @Query("select set from VocabSet set where set.id = :id and set.status = :status and set.folder.publicShared = true")
    Optional<VocabSet> findPublicFolderSetByIdAndStatus(@Param("id") Long id, @Param("status") ContentStatus status);

    long countByFolderIdAndCreatedByIdAndStatus(Long folderId, Long createdById, ContentStatus status);

    long countByStatus(ContentStatus status);
}
