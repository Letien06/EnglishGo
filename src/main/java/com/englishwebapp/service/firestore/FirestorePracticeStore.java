package com.englishwebapp.service.firestore;

import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Query;
import com.google.cloud.firestore.SetOptions;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class FirestorePracticeStore {

    private static final String DRAFTS = "practiceDrafts";
    private static final String ATTEMPTS = "practiceAttempts";

    private final FirestoreSupport firestore;

    public DraftSnapshot saveDraft(String uid, Long testId, String payload) {
        Instant now = Instant.now();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("source", "DAUTOEIC");
        data.put("testId", testId);
        data.put("payload", payload == null ? "{}" : payload);
        data.put("updatedAtMillis", now.toEpochMilli());
        try {
            firestore.await(firestore.userCollection(uid, DRAFTS)
                    .document(String.valueOf(testId))
                    .set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw firestore.failure("Firestore practice draft save failed", ex);
        }
        return new DraftSnapshot(testId, payload == null ? "{}" : payload, now);
    }

    public String draftPayload(String uid, Long testId) {
        DocumentSnapshot snapshot;
        try {
            snapshot = firestore.await(firestore.userCollection(uid, DRAFTS)
                    .document(String.valueOf(testId))
                    .get());
        } catch (Exception ex) {
            throw firestore.failure("Firestore practice draft read failed", ex);
        }
        if (!snapshot.exists()) {
            return "{}";
        }
        Object payload = snapshot.get("payload");
        return payload == null ? "{}" : payload.toString();
    }

    public void deleteDraft(String uid, Long testId) {
        try {
            firestore.await(firestore.userCollection(uid, DRAFTS)
                    .document(String.valueOf(testId))
                    .delete());
        } catch (Exception ex) {
            throw firestore.failure("Firestore practice draft delete failed", ex);
        }
    }

    public void saveAttempt(String uid, Long attemptId, Map<String, Object> data) {
        try {
            firestore.await(firestore.userCollection(uid, ATTEMPTS)
                    .document(String.valueOf(attemptId))
                    .set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw firestore.failure("Firestore practice attempt save failed", ex);
        }
    }

    public DocumentSnapshot getAttempt(String uid, Long attemptId) {
        try {
            return firestore.await(firestore.userCollection(uid, ATTEMPTS)
                    .document(String.valueOf(attemptId))
                    .get());
        } catch (Exception ex) {
            throw firestore.failure("Firestore practice attempt read failed", ex);
        }
    }

    public List<DocumentSnapshot> history(String uid, int limit) {
        try {
            return new ArrayList<>(firestore.await(firestore.userCollection(uid, ATTEMPTS)
                    .orderBy("submittedAtMillis", Query.Direction.DESCENDING)
                    .limit(limit)
                    .get()).getDocuments());
        } catch (Exception ex) {
            throw firestore.failure("Firestore practice history read failed", ex);
        }
    }

    public record DraftSnapshot(Long id, String payload, Instant updatedAt) {
    }
}
