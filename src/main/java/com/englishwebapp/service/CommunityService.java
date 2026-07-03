package com.englishwebapp.service;

import com.englishwebapp.entity.Comment;
import com.englishwebapp.entity.LeaderboardEntry;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.service.firestore.FirestoreSupport;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class CommunityService {

    private static final String ALL_TIME = "ALL_TIME";
    private static final String WEEKLY = "WEEKLY";
    private static final String TARGETS = "targets";
    private static final String COMMENTS = "comments";
    private static final String LEADERBOARDS = "leaderboards";
    private static final String ENTRIES = "entries";

    private final FirestoreSupport firestoreSupport;

    public List<Comment> comments(String targetType, Long targetId) {
        try {
            return firestoreSupport.await(commentCollection(targetType, targetId).get())
                    .getDocuments()
                    .stream()
                    .filter(doc -> doc.get("deletedAtMillis") == null)
                    .map(this::toComment)
                    .sorted(Comparator.comparing(Comment::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                    .limit(30)
                    .toList();
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load comments", ex);
        }
    }

    public Comment addComment(
            String uid,
            String email,
            String displayName,
            String targetType,
            Long targetId,
            String content) {
        if (!StringUtils.hasText(uid)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
        if (!StringUtils.hasText(content)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Comment content is required");
        }
        Comment comment = new Comment();
        comment.setUser(stubUser(uid, email, displayName));
        comment.setTargetType(targetType);
        comment.setTargetId(targetId);
        comment.setContent(content.trim());
        comment.setCreatedAt(Instant.now());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("uid", uid);
        data.put("email", email);
        data.put("displayName", displayName);
        data.put("targetType", targetType);
        data.put("targetId", targetId);
        data.put("content", comment.getContent());
        data.put("createdAtMillis", comment.getCreatedAt().toEpochMilli());
        data.put("createdAt", FieldValue.serverTimestamp());
        try {
            firestoreSupport.await(commentCollection(targetType, targetId).add(data));
            return comment;
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not save comment", ex);
        }
    }

    public List<LeaderboardEntry> leaderboard() {
        return leaderboard(ALL_TIME);
    }

    public List<LeaderboardEntry> leaderboard(String period) {
        String normalizedPeriod = normalizePeriod(period);
        try {
            List<LeaderboardEntry> entries = firestoreSupport.await(leaderboardCollection(normalizedPeriod).get())
                    .getDocuments()
                    .stream()
                    .map(doc -> toLeaderboardEntry(doc, normalizedPeriod))
                    .sorted(Comparator.comparing(LeaderboardEntry::getScore, Comparator.nullsLast(Comparator.reverseOrder())))
                    .limit(20)
                    .toList();
            for (int index = 0; index < entries.size(); index++) {
                entries.get(index).setRankPosition(index + 1);
            }
            return entries;
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load leaderboard", ex);
        }
    }

    public void addScore(User user, BigDecimal score) {
        String uid = user.getFirebaseUid();
        if (!StringUtils.hasText(uid)) {
            uid = user.getId() == null ? null : "legacy-" + user.getId();
        }
        if (!StringUtils.hasText(uid)) {
            return;
        }
        try {
            String finalUid = uid;
            firestoreSupport.await(firestoreSupport.firestore().runTransaction(transaction -> {
                var ref = leaderboardCollection(ALL_TIME).document(finalUid);
                DocumentSnapshot snapshot = transaction.get(ref).get();
                BigDecimal current = snapshot.exists() ? decimalValue(snapshot.get("score")) : BigDecimal.ZERO;
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("uid", finalUid);
                data.put("email", user.getEmail());
                data.put("displayName", user.getDisplayName());
                data.put("score", current.add(score));
                data.put("period", ALL_TIME);
                data.put("updatedAt", FieldValue.serverTimestamp());
                transaction.set(ref, data);
                return null;
            }));
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not update leaderboard score", ex);
        }
    }

    public String normalizePeriod(String period) {
        if ("weekly".equalsIgnoreCase(period) || WEEKLY.equalsIgnoreCase(period)) {
            return WEEKLY;
        }
        return ALL_TIME;
    }

    private com.google.cloud.firestore.CollectionReference commentCollection(String targetType, Long targetId) {
        return firestoreSupport.firestore()
                .collection(TARGETS)
                .document(targetType + "_" + targetId)
                .collection(COMMENTS);
    }

    private com.google.cloud.firestore.CollectionReference leaderboardCollection(String period) {
        return firestoreSupport.firestore()
                .collection(LEADERBOARDS)
                .document(period)
                .collection(ENTRIES);
    }

    private Comment toComment(DocumentSnapshot doc) {
        Comment comment = new Comment();
        comment.setUser(stubUser(
                stringValue(doc, "uid"),
                stringValue(doc, "email"),
                stringValue(doc, "displayName")));
        comment.setTargetType(stringValue(doc, "targetType"));
        comment.setTargetId(longValue(doc, "targetId"));
        comment.setContent(stringValue(doc, "content"));
        comment.setCreatedAt(instantValue(doc, "createdAtMillis"));
        comment.setDeletedAt(instantValue(doc, "deletedAtMillis"));
        return comment;
    }

    private LeaderboardEntry toLeaderboardEntry(DocumentSnapshot doc, String period) {
        LeaderboardEntry entry = new LeaderboardEntry();
        entry.setUser(stubUser(
                stringValue(doc, "uid"),
                stringValue(doc, "email"),
                stringValue(doc, "displayName")));
        entry.setScore(decimalValue(doc.get("score")));
        entry.setPeriod(period);
        entry.setUpdatedAt(instantValue(doc, "updatedAtMillis"));
        return entry;
    }

    private User stubUser(String uid, String email, String displayName) {
        User user = new User();
        user.setFirebaseUid(uid);
        user.setEmail(StringUtils.hasText(email) ? email : defaultEmail(uid));
        user.setDisplayName(displayName);
        user.setRole(UserRole.STUDENT);
        return user;
    }

    private String defaultEmail(String uid) {
        return StringUtils.hasText(uid) ? uid + "@firebase.local" : "unknown@firebase.local";
    }

    private String stringValue(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        return value == null ? null : value.toString();
    }

    private Long longValue(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Long.parseLong(text);
        }
        return null;
    }

    private BigDecimal decimalValue(Object value) {
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return new BigDecimal(text);
        }
        return BigDecimal.ZERO;
    }

    private Instant instantValue(DocumentSnapshot doc, String field) {
        Long value = longValue(doc, field);
        return value == null ? null : Instant.ofEpochMilli(value);
    }
}
