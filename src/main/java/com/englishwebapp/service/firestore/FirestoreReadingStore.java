package com.englishwebapp.service.firestore;

import com.englishwebapp.entity.ReadingFavorite;
import com.englishwebapp.entity.ReadingNote;
import com.englishwebapp.entity.ReadingProgress;
import com.englishwebapp.entity.ReadingVocabBasket;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.SetOptions;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FirestoreReadingStore {

    private static final String PROGRESS_COLLECTION = "readingProgress";
    private static final String NOTES_COLLECTION = "readingNotes";
    private static final String FAVORITES_COLLECTION = "readingFavorites";
    private static final String VOCAB_BASKET_COLLECTION = "readingVocabBasket";

    private final FirestoreSupport support;

    public List<ReadingProgress> findProgressByPartAndLevel(String uid, Integer part, Integer level) {
        try {
            CollectionReference collection = support.userCollection(uid, PROGRESS_COLLECTION);
            var docs = support.await(collection.whereEqualTo("part", part).whereEqualTo("level", level).get());
            List<ReadingProgress> rows = new ArrayList<>();
            for (QueryDocumentSnapshot doc : docs) {
                rows.add(toProgress(doc));
            }
            return rows;
        } catch (Exception ex) {
            throw support.failure("Could not load reading progress", ex);
        }
    }

    public Optional<ReadingProgress> findProgress(String uid, String questionId) {
        try {
            DocumentSnapshot snapshot = support.await(
                    support.userCollection(uid, PROGRESS_COLLECTION).document(questionId).get());
            return snapshot.exists() ? Optional.of(toProgress(snapshot)) : Optional.empty();
        } catch (Exception ex) {
            throw support.failure("Could not load reading progress detail", ex);
        }
    }

    public void saveProgress(String uid, ReadingProgress progress) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("source", progress.getSource());
            data.put("part", progress.getPart());
            data.put("level", progress.getLevel());
            data.put("itemId", progress.getItemId());
            data.put("questionId", progress.getQuestionId());
            data.put("selectedAnswer", progress.getSelectedAnswer());
            data.put("correctAnswer", progress.getCorrectAnswer());
            data.put("correct", progress.isCorrect());
            data.put("modeUsed", progress.getModeUsed());
            data.put("assistPercent", progress.getAssistPercent());
            data.put("elapsedSeconds", progress.getElapsedSeconds());
            data.put("score", progress.getScore());
            data.put("completedAtMillis", millisOrNow(progress.getCompletedAt()));
            data.put("updatedAt", FieldValue.serverTimestamp());
            support.await(support.userCollection(uid, PROGRESS_COLLECTION)
                    .document(progress.getQuestionId())
                    .set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw support.failure("Could not save reading progress", ex);
        }
    }

    public void deleteProgressByPartAndLevel(String uid, Integer part, Integer level) {
        try {
            var docs = support.await(support.userCollection(uid, PROGRESS_COLLECTION)
                    .whereEqualTo("part", part)
                    .whereEqualTo("level", level)
                    .get());
            var batch = support.firestore().batch();
            for (QueryDocumentSnapshot doc : docs) {
                batch.delete(doc.getReference());
            }
            support.await(batch.commit());
        } catch (Exception ex) {
            throw support.failure("Could not reset reading progress", ex);
        }
    }

    public Optional<ReadingNote> findNote(String uid, String itemId) {
        try {
            DocumentSnapshot snapshot = support.await(
                    support.userCollection(uid, NOTES_COLLECTION).document(itemId).get());
            if (!snapshot.exists()) {
                return Optional.empty();
            }
            ReadingNote note = new ReadingNote();
            note.setItemId(snapshot.getString("itemId"));
            note.setQuestionId(snapshot.getString("questionId"));
            note.setNote(snapshot.getString("note"));
            note.setCreatedAt(instantValue(snapshot, "createdAtMillis"));
            note.setUpdatedAt(instantValue(snapshot, "updatedAtMillis"));
            return Optional.of(note);
        } catch (Exception ex) {
            throw support.failure("Could not load reading note", ex);
        }
    }

    public void saveNote(String uid, ReadingNote note) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("itemId", note.getItemId());
            data.put("questionId", note.getQuestionId());
            data.put("note", note.getNote());
            data.put("updatedAtMillis", millisOrNow(note.getUpdatedAt()));
            data.put("updatedAt", FieldValue.serverTimestamp());
            if (note.getCreatedAt() == null) {
                data.put("createdAtMillis", Instant.now().toEpochMilli());
                data.put("createdAt", FieldValue.serverTimestamp());
            }
            support.await(support.userCollection(uid, NOTES_COLLECTION)
                    .document(note.getItemId())
                    .set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw support.failure("Could not save reading note", ex);
        }
    }

    public Optional<ReadingFavorite> findFavorite(String uid, String itemId) {
        try {
            DocumentSnapshot snapshot = support.await(
                    support.userCollection(uid, FAVORITES_COLLECTION).document(itemId).get());
            if (!snapshot.exists()) {
                return Optional.empty();
            }
            ReadingFavorite favorite = new ReadingFavorite();
            favorite.setItemId(snapshot.getString("itemId"));
            favorite.setQuestionId(snapshot.getString("questionId"));
            favorite.setPart(intValue(snapshot, "part"));
            favorite.setLevel(intValue(snapshot, "level"));
            favorite.setCreatedAt(instantValue(snapshot, "createdAtMillis"));
            return Optional.of(favorite);
        } catch (Exception ex) {
            throw support.failure("Could not load reading favorite", ex);
        }
    }

    public void saveFavorite(String uid, ReadingFavorite favorite) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("itemId", favorite.getItemId());
            data.put("questionId", favorite.getQuestionId());
            data.put("part", favorite.getPart());
            data.put("level", favorite.getLevel());
            data.put("createdAtMillis", millisOrNow(favorite.getCreatedAt()));
            data.put("createdAt", FieldValue.serverTimestamp());
            support.await(support.userCollection(uid, FAVORITES_COLLECTION)
                    .document(favorite.getItemId())
                    .set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw support.failure("Could not save reading favorite", ex);
        }
    }

    public void deleteFavorite(String uid, String itemId) {
        try {
            support.await(support.userCollection(uid, FAVORITES_COLLECTION).document(itemId).delete());
        } catch (Exception ex) {
            throw support.failure("Could not delete reading favorite", ex);
        }
    }

    public void saveVocab(String uid, ReadingVocabBasket vocab) {
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("itemId", vocab.getItemId());
            data.put("questionId", vocab.getQuestionId());
            data.put("word", vocab.getWord());
            data.put("normalizedWord", normalized(vocab.getWord()));
            data.put("meaning", vocab.getMeaning());
            data.put("example", vocab.getExample());
            data.put("createdAtMillis", millisOrNow(vocab.getCreatedAt()));
            data.put("createdAt", FieldValue.serverTimestamp());
            support.await(support.userCollection(uid, VOCAB_BASKET_COLLECTION).add(data));
        } catch (Exception ex) {
            throw support.failure("Could not save reading vocabulary", ex);
        }
    }

    private ReadingProgress toProgress(DocumentSnapshot doc) {
        ReadingProgress progress = new ReadingProgress();
        progress.setSource(doc.getString("source"));
        progress.setPart(intValue(doc, "part"));
        progress.setLevel(intValue(doc, "level"));
        progress.setItemId(doc.getString("itemId"));
        progress.setQuestionId(doc.getString("questionId"));
        progress.setSelectedAnswer(doc.getString("selectedAnswer"));
        progress.setCorrectAnswer(doc.getString("correctAnswer"));
        progress.setCorrect(Boolean.TRUE.equals(doc.getBoolean("correct")));
        progress.setModeUsed(doc.getString("modeUsed"));
        progress.setAssistPercent(intValue(doc, "assistPercent"));
        progress.setElapsedSeconds(intValue(doc, "elapsedSeconds"));
        progress.setScore(intValue(doc, "score"));
        progress.setCompletedAt(instantValue(doc, "completedAtMillis"));
        return progress;
    }

    private Integer intValue(DocumentSnapshot doc, String field) {
        Long value = doc.getLong(field);
        return value == null ? null : value.intValue();
    }

    private Instant instantValue(DocumentSnapshot doc, String field) {
        Long value = doc.getLong(field);
        return value == null ? null : Instant.ofEpochMilli(value);
    }

    private long millisOrNow(Instant instant) {
        return instant == null ? Instant.now().toEpochMilli() : instant.toEpochMilli();
    }

    private String normalized(String value) {
        return value == null ? null : value.trim().toLowerCase(Locale.ROOT);
    }
}
