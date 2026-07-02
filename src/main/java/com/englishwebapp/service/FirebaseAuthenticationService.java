package com.englishwebapp.service;

import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class FirebaseAuthenticationService {

    private static final String USERS_COLLECTION = "users";
    private static final String COUNTERS_COLLECTION = "counters";

    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;
    private final ObjectProvider<Firestore> firestoreProvider;

    public User verifyAndProvisionUser(String idToken) {
        if (!StringUtils.hasText(idToken)) {
            throw new BadCredentialsException("Firebase ID token is required");
        }

        FirebaseAuth firebaseAuth = Optional.ofNullable(firebaseAuthProvider.getIfAvailable())
                .orElseThrow(() -> new IllegalStateException("Firebase authentication SDK is not configured"));
        Firestore firestore = Optional.ofNullable(firestoreProvider.getIfAvailable())
                .orElseThrow(() -> new IllegalStateException("Firestore is not configured"));

        FirebaseToken decodedToken;
        try {
            decodedToken = firebaseAuth.verifyIdToken(idToken);
        } catch (FirebaseAuthException ex) {
            throw new BadCredentialsException("Invalid Firebase ID token", ex);
        }

        try {
            return await(firestore.runTransaction(transaction -> {
                DocumentReference userRef = firestore.collection(USERS_COLLECTION).document(decodedToken.getUid());
                DocumentSnapshot snapshot = transaction.get(userRef).get();
                Long id = snapshot.exists() ? longValue(snapshot, "id") : null;
                if (id == null) {
                    id = nextIdInTransaction(firestore, transaction, "users");
                }

                String email = resolveEmail(decodedToken);
                UserRole role = UserRole.STUDENT;
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("id", id);
                data.put("firebaseUid", decodedToken.getUid());
                data.put("email", email);
                data.put("displayName", decodedToken.getName());
                data.put("avatarUrl", decodedToken.getPicture());
                data.put("role", role.name());
                data.put("updatedAtMillis", Instant.now().toEpochMilli());
                if (!snapshot.exists()) {
                    data.put("createdAtMillis", Instant.now().toEpochMilli());
                }
                transaction.set(userRef, data, SetOptions.merge());
                return toUser(id, decodedToken, email, role);
            }));
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Could not create Firestore user session", ex);
        }
    }

    private Long nextIdInTransaction(
            Firestore firestore,
            com.google.cloud.firestore.Transaction transaction,
            String counterName) throws Exception {
        DocumentReference counterRef = firestore.collection(COUNTERS_COLLECTION).document(counterName);
        DocumentSnapshot counter = transaction.get(counterRef).get();
        long current = counter.exists() && longValue(counter, "value") != null ? longValue(counter, "value") : 0L;
        long next = current + 1;
        transaction.set(counterRef, Map.of("value", next), SetOptions.merge());
        return next;
    }

    private User toUser(Long id, FirebaseToken decodedToken, String email, UserRole role) {
        User user = new User();
        user.setId(id);
        user.setFirebaseUid(decodedToken.getUid());
        user.setEmail(email);
        user.setDisplayName(decodedToken.getName());
        user.setAvatarUrl(decodedToken.getPicture());
        user.setRole(role);
        return user;
    }

    private String resolveEmail(FirebaseToken decodedToken) {
        if (StringUtils.hasText(decodedToken.getEmail())) {
            return decodedToken.getEmail();
        }
        return decodedToken.getUid() + "@firebase.local";
    }

    private Long longValue(DocumentSnapshot snapshot, String field) {
        Object value = snapshot.get(field);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Long.parseLong(text);
        }
        return null;
    }

    private <T> T await(ApiFuture<T> future) throws InterruptedException, ExecutionException {
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw ex;
        }
    }
}
