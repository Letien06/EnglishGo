package com.englishwebapp.service;

import com.englishwebapp.dto.ListeningToolRequest;
import com.englishwebapp.dto.ListeningToolResponse;
import com.englishwebapp.entity.ListeningFavorite;
import com.englishwebapp.entity.ListeningNote;
import com.englishwebapp.entity.ListeningVocabBasket;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.ListeningFavoriteRepository;
import com.englishwebapp.repository.ListeningNoteRepository;
import com.englishwebapp.repository.ListeningProgressRepository;
import com.englishwebapp.repository.ListeningVocabBasketRepository;
import com.englishwebapp.repository.UserRepository;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class ListeningToolService {

    private final ListeningNoteRepository listeningNoteRepository;
    private final ListeningFavoriteRepository listeningFavoriteRepository;
    private final ListeningVocabBasketRepository listeningVocabBasketRepository;
    private final ListeningProgressRepository listeningProgressRepository;
    private final UserRepository userRepository;

    @Transactional
    public ListeningToolResponse saveNote(Long userId, ListeningToolRequest request) {
        if (userId == null) {
            return unauthenticated("Đăng nhập để lưu ghi chú.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.note())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Note is required");
        }
        Instant now = Instant.now();
        ListeningNote note = listeningNoteRepository.findByUserIdAndItemId(userId, request.itemId().trim())
                .orElseGet(() -> {
                    ListeningNote created = new ListeningNote();
                    created.setUser(user(userId));
                    created.setItemId(request.itemId().trim());
                    created.setCreatedAt(now);
                    return created;
                });
        note.setQuestionId(clean(request.questionId()));
        note.setNote(request.note().trim());
        note.setUpdatedAt(now);
        listeningNoteRepository.save(note);
        return new ListeningToolResponse(true, true, null, "Đã lưu ghi chú.");
    }

    @Transactional
    public ListeningToolResponse toggleFavorite(Long userId, ListeningToolRequest request) {
        if (userId == null) {
            return unauthenticated("Đăng nhập để lưu yêu thích.");
        }
        requireItem(request);
        requirePartLevel(request);
        var existing = listeningFavoriteRepository.findByUserIdAndItemId(userId, request.itemId().trim());
        if (existing.isPresent()) {
            listeningFavoriteRepository.delete(existing.get());
            return new ListeningToolResponse(true, true, false, "Đã bỏ yêu thích.");
        }
        ListeningFavorite favorite = new ListeningFavorite();
        favorite.setUser(user(userId));
        favorite.setItemId(request.itemId().trim());
        favorite.setQuestionId(clean(request.questionId()));
        favorite.setPart(request.part());
        favorite.setLevel(request.level());
        favorite.setCreatedAt(Instant.now());
        listeningFavoriteRepository.save(favorite);
        return new ListeningToolResponse(true, true, true, "Đã lưu yêu thích.");
    }

    @Transactional
    public ListeningToolResponse addVocab(Long userId, ListeningToolRequest request) {
        if (userId == null) {
            return unauthenticated("Đăng nhập để lưu từ vựng.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.word())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Word is required");
        }
        ListeningVocabBasket vocab = new ListeningVocabBasket();
        vocab.setUser(user(userId));
        vocab.setItemId(request.itemId().trim());
        vocab.setQuestionId(clean(request.questionId()));
        vocab.setWord(request.word().trim());
        vocab.setMeaning(clean(request.meaning()));
        vocab.setExample(clean(request.example()));
        vocab.setCreatedAt(Instant.now());
        listeningVocabBasketRepository.save(vocab);
        return new ListeningToolResponse(true, true, null, "Đã thêm vào giỏ từ.");
    }

    @Transactional
    public ListeningToolResponse resetLevel(Long userId, ListeningToolRequest request) {
        if (userId == null) {
            return unauthenticated("Đăng nhập để reset tiến độ.");
        }
        requirePartLevel(request);
        listeningProgressRepository.deleteByUserIdAndPartAndLevel(userId, request.part(), request.level());
        return new ListeningToolResponse(true, true, null, "Đã reset tiến độ level.");
    }

    private ListeningToolResponse unauthenticated(String message) {
        return new ListeningToolResponse(false, false, null, message);
    }

    private User user(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private void requireItem(ListeningToolRequest request) {
        if (!StringUtils.hasText(request.itemId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Item is required");
        }
    }

    private void requirePartLevel(ListeningToolRequest request) {
        if (request.part() == null || request.part() < 1 || request.part() > 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Listening part must be between 1 and 4");
        }
        if (request.level() == null || request.level() < 1 || request.level() > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Difficulty level must be between 1 and 5");
        }
    }

    private String clean(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
