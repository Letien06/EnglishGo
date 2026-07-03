package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.englishwebapp.dto.ReadingProgressRequest;
import com.englishwebapp.entity.ReadingProgress;
import com.englishwebapp.service.firestore.FirestoreReadingStore;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class ReadingProgressServiceTest {

    @Mock
    private FirestoreReadingStore readingStore;

    @InjectMocks
    private ReadingProgressService service;

    @Test
    void guestRecordComputesCorrectButDoesNotPersist() {
        var response = service.record(null, request(5, "A", "a"));

        assertThat(response.saved()).isFalse();
        assertThat(response.authenticated()).isFalse();
        assertThat(response.correct()).isTrue();
        verify(readingStore, never()).saveProgress(any(), any());
    }

    @Test
    void authenticatedRecordPersistsNormalizedProgress() {
        when(readingStore.findProgress("uid-7", "question-1")).thenReturn(Optional.empty());

        var response = service.record("uid-7", request(6, " b ", "B"));

        assertThat(response.saved()).isTrue();
        assertThat(response.authenticated()).isTrue();
        assertThat(response.correct()).isTrue();

        ArgumentCaptor<ReadingProgress> captor = ArgumentCaptor.forClass(ReadingProgress.class);
        verify(readingStore).saveProgress(eq("uid-7"), captor.capture());
        ReadingProgress saved = captor.getValue();
        assertThat(saved.getPart()).isEqualTo(6);
        assertThat(saved.getLevel()).isEqualTo(2);
        assertThat(saved.getItemId()).isEqualTo("item-1");
        assertThat(saved.getQuestionId()).isEqualTo("question-1");
        assertThat(saved.getSelectedAnswer()).isEqualTo("B");
        assertThat(saved.getCorrectAnswer()).isEqualTo("B");
        assertThat(saved.isCorrect()).isTrue();
        assertThat(saved.getModeUsed()).isEqualTo("fill");
        assertThat(saved.getAssistPercent()).isEqualTo(50);
        assertThat(saved.getElapsedSeconds()).isEqualTo(12);
    }

    @Test
    void invalidReadingPartIsRejectedForAuthenticatedSave() {
        assertThatThrownBy(() -> service.record("uid-7", request(4, "A", "A")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Reading part must be between 5 and 7");
    }

    private ReadingProgressRequest request(Integer part, String selected, String correct) {
        return new ReadingProgressRequest(
                part,
                2,
                "item-1",
                "question-1",
                selected,
                correct,
                "fill",
                50,
                12);
    }
}
