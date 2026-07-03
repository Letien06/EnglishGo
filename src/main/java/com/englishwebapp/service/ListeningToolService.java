package com.englishwebapp.service;

import com.englishwebapp.dto.ListeningToolRequest;
import com.englishwebapp.dto.ListeningToolResponse;
import com.englishwebapp.entity.ListeningFavorite;
import com.englishwebapp.entity.ListeningNote;
import com.englishwebapp.entity.ListeningVocabBasket;
import com.englishwebapp.service.firestore.FirestoreListeningStore;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class ListeningToolService {

    private final FirestoreListeningStore listeningStore;

    public ListeningToolResponse saveNote(String uid, ListeningToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de luu ghi chu.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.note())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Note is required");
        }
        Instant now = Instant.now();
        ListeningNote note = listeningStore.findNote(uid, request.itemId().trim())
                .orElseGet(() -> {
                    ListeningNote created = new ListeningNote();
                    created.setItemId(request.itemId().trim());
                    created.setCreatedAt(now);
                    return created;
                });
        note.setQuestionId(clean(request.questionId()));
        note.setNote(request.note().trim());
        note.setUpdatedAt(now);
        listeningStore.saveNote(uid, note);
        return new ListeningToolResponse(true, true, null, "Da luu ghi chu.");
    }

    public ListeningToolResponse toggleFavorite(String uid, ListeningToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de luu yeu thich.");
        }
        requireItem(request);
        requirePartLevel(request);
        var existing = listeningStore.findFavorite(uid, request.itemId().trim());
        if (existing.isPresent()) {
            listeningStore.deleteFavorite(uid, request.itemId().trim());
            return new ListeningToolResponse(true, true, false, "Da bo yeu thich.");
        }
        ListeningFavorite favorite = new ListeningFavorite();
        favorite.setItemId(request.itemId().trim());
        favorite.setQuestionId(clean(request.questionId()));
        favorite.setPart(request.part());
        favorite.setLevel(request.level());
        favorite.setCreatedAt(Instant.now());
        listeningStore.saveFavorite(uid, favorite);
        return new ListeningToolResponse(true, true, true, "Da luu yeu thich.");
    }

    public ListeningToolResponse addVocab(String uid, ListeningToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de luu tu vung.");
        }
        requireItem(request);
        if (!StringUtils.hasText(request.word())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Word is required");
        }
        ListeningVocabBasket vocab = new ListeningVocabBasket();
        vocab.setItemId(request.itemId().trim());
        vocab.setQuestionId(clean(request.questionId()));
        vocab.setWord(request.word().trim());
        vocab.setMeaning(clean(request.meaning()));
        vocab.setExample(clean(request.example()));
        vocab.setCreatedAt(Instant.now());
        listeningStore.saveVocab(uid, vocab);
        return new ListeningToolResponse(true, true, null, "Da them vao gio tu.");
    }

    public ListeningToolResponse resetLevel(String uid, ListeningToolRequest request) {
        if (!StringUtils.hasText(uid)) {
            return unauthenticated("Dang nhap de reset tien do.");
        }
        requirePartLevel(request);
        listeningStore.deleteProgressByPartAndLevel(uid, request.part(), request.level());
        return new ListeningToolResponse(true, true, null, "Da reset tien do level.");
    }

    private ListeningToolResponse unauthenticated(String message) {
        return new ListeningToolResponse(false, false, null, message);
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
