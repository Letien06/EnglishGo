package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.entity.MediaType;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class MediaStorageServiceTest {

    @Test
    void rejectsWrongAudioContentType() {
        AppProperties properties = new AppProperties();
        MediaStorageService service = new MediaStorageService(properties);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "note.txt",
                "text/plain",
                "not audio".getBytes());

        assertThatThrownBy(() -> service.store(file, MediaType.AUDIO, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mp3");
    }
}
