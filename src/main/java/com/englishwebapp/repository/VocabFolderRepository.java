package com.englishwebapp.repository;

import com.englishwebapp.entity.VocabFolder;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VocabFolderRepository extends JpaRepository<VocabFolder, Long> {

    List<VocabFolder> findByUserIdOrderByUpdatedAtDesc(Long userId);

    List<VocabFolder> findByUserIdAndNameContainingIgnoreCaseOrderByUpdatedAtDesc(Long userId, String name);

    Optional<VocabFolder> findByIdAndUserId(Long id, Long userId);

    Optional<VocabFolder> findByIdAndPublicSharedTrue(Long id);

    List<VocabFolder> findByPublicSharedTrueOrderBySharedAtDesc();

    List<VocabFolder> findByNameContainingIgnoreCaseAndPublicSharedTrueOrderBySharedAtDesc(String name);
}
