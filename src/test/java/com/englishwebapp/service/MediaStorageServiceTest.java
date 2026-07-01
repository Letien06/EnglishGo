package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.entity.MediaAsset;
import com.englishwebapp.entity.MediaType;
import com.englishwebapp.repository.MediaAssetRepository;
import com.englishwebapp.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
class MediaStorageServiceTest {

    @Mock
    private MediaAssetRepository mediaAssetRepository;

    @Mock
    private UserRepository userRepository;

    @Test
    void rejectsWrongAudioContentType() {
        AppProperties properties = new AppProperties();
        MediaStorageService service = new MediaStorageService(properties, mediaAssetRepository, userRepository);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "note.txt",
                "text/plain",
                "not audio".getBytes());

        assertThatThrownBy(() -> service.store(file, MediaType.AUDIO, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mp3");
        verify(mediaAssetRepository, never()).save(org.mockito.ArgumentMatchers.any(MediaAsset.class));
    }
}
