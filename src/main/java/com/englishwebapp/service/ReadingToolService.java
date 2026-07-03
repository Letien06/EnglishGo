package com.englishwebapp.service;

import com.englishwebapp.dto.ReadingToolRequest;
import com.englishwebapp.dto.ReadingToolResponse;
import com.englishwebapp.entity.ReadingFavorite;
import com.englishwebapp.entity.ReadingNote;
import com.englishwebapp.entity.ReadingVocabBasket;
import com.englishwebapp.service.firestore.FirestoreReadingStore;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class ReadingToolService {

    private final FirestoreReadingStore readingStore;

    public ReadingToolResponse saveNote(String uid, ReadingToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de luu ghi chu.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.note())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Note is required");
        }
        Instant now = Instant.now();
        ReadingNote note = readingStore.findNote(uid, request.itemId().trim())
                .orElseGet(() -> {
                    ReadingNote created = new ReadingNote();
                    created.setItemId(request.itemId().trim());
                    created.setCreatedAt(now);
                    return created;
                });
        note.setQuestionId(clean(request.questionId()));
        note.setNote(request.note().trim());
        note.setUpdatedAt(now);
        readingStore.saveNote(uid, note);
        return new ReadingToolResponse(true, true, null, "Da luu ghi chu.");
    }

    public ReadingToolResponse toggleFavorite(String uid, ReadingToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de luu yeu thich.");
        }
        requireItem(request);
        requirePartLevel(request);
        var existing = readingStore.findFavorite(uid, request.itemId().trim());
        if (existing.isPresent()) {
            readingStore.deleteFavorite(uid, request.itemId().trim());
            return new ReadingToolResponse(true, true, false, "Da bo yeu thich.");
        }
        ReadingFavorite favorite = new ReadingFavorite();
        favorite.setItemId(request.itemId().trim());
        favorite.setQuestionId(clean(request.questionId()));
        favorite.setPart(request.part());
        favorite.setLevel(request.level());
        favorite.setCreatedAt(Instant.now());
        readingStore.saveFavorite(uid, favorite);
        return new ReadingToolResponse(true, true, true, "Da luu yeu thich.");
    }

    public ReadingToolResponse addVocab(String uid, ReadingToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de luu tu vung.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.word())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Word is required");
        }
        ReadingVocabBasket vocab = new ReadingVocabBasket();
        vocab.setItemId(request.itemId().trim());
        vocab.setQuestionId(clean(request.questionId()));
        vocab.setWord(request.word().trim());
        vocab.setMeaning(clean(request.meaning()));
        vocab.setExample(clean(request.example()));
        vocab.setCreatedAt(Instant.now());
        readingStore.saveVocab(uid, vocab);
        return new ReadingToolResponse(true, true, null, "Da them vao gio tu.");
    }

    public ReadingToolResponse resetLevel(String uid, ReadingToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de reset tien do.");
        }
        requirePartLevel(request);
        readingStore.deleteProgressByPartAndLevel(uid, request.part(), request.level());
        return new ReadingToolResponse(true, true, null, "Da reset tien do level.");
    }

    private ReadingToolResponse unauthenticated(String message) {
        return new ReadingToolResponse(false, false, null, message);
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
