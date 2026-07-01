package com.englishwebapp.repository;

import com.englishwebapp.entity.MediaAsset;
import com.englishwebapp.entity.MediaType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MediaAssetRepository extends JpaRepository<MediaAsset, Long> {

    Page<MediaAsset> findByMediaType(MediaType mediaType, Pageable pageable);
}
