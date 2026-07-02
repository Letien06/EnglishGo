package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.englishwebapp.dto.ReadingToolRequest;
import com.englishwebapp.entity.ReadingFavorite;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.ReadingFavoriteRepository;
import com.englishwebapp.repository.ReadingNoteRepository;
import com.englishwebapp.repository.ReadingProgressRepository;
import com.englishwebapp.repository.ReadingVocabBasketRepository;
import com.englishwebapp.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReadingToolServiceTest {

    @Mock
    private ReadingNoteRepository readingNoteRepository;

    @Mock
    private ReadingFavoriteRepository readingFavoriteRepository;

    @Mock
    private ReadingVocabBasketRepository readingVocabBasketRepository;

    @Mock
    private ReadingProgressRepository readingProgressRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private ReadingToolService service;

    @Test
    void unauthenticatedFavoriteDoesNotPersist() {
        var response = service.toggleFavorite(null, request());

        assertThat(response.saved()).isFalse();
        assertThat(response.authenticated()).isFalse();
        assertThat(response.message()).contains("Dang nhap");
    }

    @Test
    void toggleFavoriteCreatesFavoriteWhenMissing() {
        User user = new User();
        user.setId(7L);
        when(readingFavoriteRepository.findByUserIdAndItemId(7L, "item-1")).thenReturn(Optional.empty());
        when(userRepository.findById(7L)).thenReturn(Optional.of(user));

        var response = service.toggleFavorite(7L, request());

        assertThat(response.saved()).isTrue();
        assertThat(response.favorite()).isTrue();
        verify(readingFavoriteRepository).save(any(ReadingFavorite.class));
    }

    @Test
    void toggleFavoriteDeletesFavoriteWhenExisting() {
        ReadingFavorite existing = new ReadingFavorite();
        when(readingFavoriteRepository.findByUserIdAndItemId(7L, "item-1")).thenReturn(Optional.of(existing));

        var response = service.toggleFavorite(7L, request());

        assertThat(response.saved()).isTrue();
        assertThat(response.favorite()).isFalse();
        verify(readingFavoriteRepository).delete(existing);
    }

    @Test
    void resetLevelDeletesProgressForPartAndLevel() {
        var response = service.resetLevel(7L, request());

        assertThat(response.saved()).isTrue();
        verify(readingProgressRepository).deleteByUserIdAndPartAndLevel(7L, 5, 2);
    }

    private ReadingToolRequest request() {
        return new ReadingToolRequest(
                5,
                2,
                "item-1",
                "question-1",
                "note",
                "word",
                "meaning",
                "example",
                null);
    }
}
