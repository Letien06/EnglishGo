package com.englishwebapp.service;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.dto.MediaUploadResponse;
import com.englishwebapp.entity.MediaAsset;
import com.englishwebapp.entity.MediaType;
import com.englishwebapp.repository.MediaAssetRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.security.AppUserPrincipal;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class MediaStorageService {

    private static final Set<String> AUDIO_TYPES = Set.of("audio/mpeg", "audio/mp3", "audio/x-mpeg");
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png");

    private final AppProperties appProperties;
    private final MediaAssetRepository mediaAssetRepository;
    private final UserRepository userRepository;

    @Transactional
    public MediaUploadResponse store(MultipartFile file, MediaType mediaType, AppUserPrincipal principal) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File upload không được để trống.");
        }

        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        validateContentType(mediaType, contentType);

        String originalName = StringUtils.cleanPath(file.getOriginalFilename() == null
                ? "upload"
                : file.getOriginalFilename());
        String extension = extensionFor(originalName, contentType);
        String folder = mediaType == MediaType.AUDIO ? "audio" : "images";
        String storedFileName = UUID.randomUUID() + extension;

        Path root = Path.of(appProperties.getUploadDir()).toAbsolutePath().normalize();
        Path targetDir = root.resolve(folder).normalize();
        Path targetFile = targetDir.resolve(storedFileName).normalize();
        if (!targetFile.startsWith(targetDir)) {
            throw new IllegalArgumentException("Tên file không hợp lệ.");
        }

        try {
            Files.createDirectories(targetDir);
            Files.copy(file.getInputStream(), targetFile, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException ex) {
            throw new IllegalStateException("Không thể lưu file upload.", ex);
        }

        MediaAsset asset = new MediaAsset();
        asset.setOriginalFileName(originalName);
        asset.setStoredFileName(storedFileName);
        asset.setContentType(contentType);
        asset.setFileSize(file.getSize());
        asset.setStoragePath(targetFile.toString());
        asset.setPublicUrl("/media/" + folder + "/" + storedFileName);
        asset.setMediaType(mediaType);
        if (principal != null && principal.id() != null) {
            asset.setUploadedBy(userRepository.getReferenceById(principal.id()));
        }

        return toResponse(mediaAssetRepository.save(asset));
    }

    public MediaUploadResponse toResponse(MediaAsset asset) {
        return new MediaUploadResponse(
                asset.getId(),
                asset.getMediaType(),
                asset.getOriginalFileName(),
                asset.getPublicUrl(),
                asset.getContentType(),
                asset.getFileSize());
    }

    private void validateContentType(MediaType mediaType, String contentType) {
        if (mediaType == MediaType.AUDIO && !AUDIO_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("Chỉ hỗ trợ audio mp3.");
        }
        if (mediaType == MediaType.IMAGE && !IMAGE_TYPES.contains(contentType)) {
            throw new IllegalArgumentException("Chỉ hỗ trợ ảnh jpg hoặc png.");
        }
    }

    private String extensionFor(String originalName, String contentType) {
        int index = originalName.lastIndexOf('.');
        if (index >= 0 && index < originalName.length() - 1) {
            String extension = originalName.substring(index).toLowerCase(Locale.ROOT);
            if (extension.matches("\\.[a-z0-9]{1,8}")) {
                return extension;
            }
        }
        if ("image/png".equals(contentType)) {
            return ".png";
        }
        if ("image/jpeg".equals(contentType)) {
            return ".jpg";
        }
        return ".mp3";
    }
}
