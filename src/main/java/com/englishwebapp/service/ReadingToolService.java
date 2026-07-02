package com.englishwebapp.service;

import com.englishwebapp.dto.ReadingToolRequest;
import com.englishwebapp.dto.ReadingToolResponse;
import com.englishwebapp.entity.ReadingFavorite;
import com.englishwebapp.entity.ReadingNote;
import com.englishwebapp.entity.ReadingVocabBasket;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.ReadingFavoriteRepository;
import com.englishwebapp.repository.ReadingNoteRepository;
import com.englishwebapp.repository.ReadingProgressRepository;
import com.englishwebapp.repository.ReadingVocabBasketRepository;
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
public class ReadingToolService {

    private final ReadingNoteRepository readingNoteRepository;
    private final ReadingFavoriteRepository readingFavoriteRepository;
    private final ReadingVocabBasketRepository readingVocabBasketRepository;
    private final ReadingProgressRepository readingProgressRepository;
    private final UserRepository userRepository;

    @Transactional
    public ReadingToolResponse saveNote(Long userId, ReadingToolRequest request) {
        if (userId == null) {
            return unauthenticated("Dang nhap de luu ghi chu.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.note())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Note is required");
        }
        Instant now = Instant.now();
        ReadingNote note = readingNoteRepository.findByUserIdAndItemId(userId, request.itemId().trim())
                .orElseGet(() -> {
                    ReadingNote created = new ReadingNote();
                    created.setUser(user(userId));
                    created.setItemId(request.itemId().trim());
                    created.setCreatedAt(now);
                    return created;
                });
        note.setQuestionId(clean(request.questionId()));
        note.setNote(request.note().trim());
        note.setUpdatedAt(now);
        readingNoteRepository.save(note);
        return new ReadingToolResponse(true, true, null, "Da luu ghi chu.");
    }

    @Transactional
    public ReadingToolResponse toggleFavorite(Long userId, ReadingToolRequest request) {
        if (userId == null) {
            return unauthenticated("Dang nhap de luu yeu thich.");
        }
        requireItem(request);
        requirePartLevel(request);
        var existing = readingFavoriteRepository.findByUserIdAndItemId(userId, request.itemId().trim());
        if (existing.isPresent()) {
            readingFavoriteRepository.delete(existing.get());
            return new ReadingToolResponse(true, true, false, "Da bo yeu thich.");
        }
        ReadingFavorite favorite = new ReadingFavorite();
        favorite.setUser(user(userId));
        favorite.setItemId(request.itemId().trim());
        favorite.setQuestionId(clean(request.questionId()));
        favorite.setPart(request.part());
        favorite.setLevel(request.level());
        favorite.setCreatedAt(Instant.now());
        readingFavoriteRepository.save(favorite);
        return new ReadingToolResponse(true, true, true, "Da luu yeu thich.");
    }

    @Transactional
    public ReadingToolResponse addVocab(Long userId, ReadingToolRequest request) {
        if (userId == null) {
            return unauthenticated("Dang nhap de luu tu vung.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.word())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Word is required");
        }
        ReadingVocabBasket vocab = new ReadingVocabBasket();
        vocab.setUser(user(userId));
        vocab.setItemId(request.itemId().trim());
        vocab.setQuestionId(clean(request.questionId()));
        vocab.setWord(request.word().trim());
        vocab.setMeaning(clean(request.meaning()));
        vocab.setExample(clean(request.example()));
        vocab.setCreatedAt(Instant.now());
        readingVocabBasketRepository.save(vocab);
        return new ReadingToolResponse(true, true, null, "Da them vao gio tu.");
    }

    @Transactional
    public ReadingToolResponse resetLevel(Long userId, ReadingToolRequest request) {
        if (userId == null) {
            return unauthenticated("Dang nhap de reset tien do.");
        }
        requirePartLevel(request);
        readingProgressRepository.deleteByUserIdAndPartAndLevel(userId, request.part(), request.level());
        return new ReadingToolResponse(true, true, null, "Da reset tien do level.");
    }

    private ReadingToolResponse unauthenticated(String message) {
        return new ReadingToolResponse(false, false, null, message);
    }

    private User user(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private void requireItem(ReadingToolRequest request) {
        if (!StringUtils.hasText(request.itemId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Item is required");
        }
    }

    private void requirePartLevel(ReadingToolRequest request) {
        if (request.part() == null || request.part() < 5 || request.part() > 7) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reading part must be between 5 and 7");
        }
        if (request.level() == null || request.level() < 1 || request.level() > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Difficulty level must be between 1 and 5");
        }
    }

    private String clean(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
