package com.englishwebapp.service;

import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.service.firestore.FirestoreSupport;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.SetOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class FirebaseAuthenticationService {

    private static final String USERS_COLLECTION = "users";

    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;
    private final FirestoreSupport firestoreSupport;

    public User verifyAndProvisionUser(String idToken) {
        if (!StringUtils.hasText(idToken)) {
            throw new BadCredentialsException("Firebase ID token is required");
        }

        FirebaseAuth firebaseAuth = requiredBean(
                firebaseAuthProvider,
                "Firebase authentication SDK is not configured correctly");
        FirebaseToken decodedToken;
        try {
            decodedToken = firebaseAuth.verifyIdToken(idToken);
        } catch (FirebaseAuthException ex) {
            throw new BadCredentialsException("Invalid Firebase ID token", ex);
        }

        try {
            return firestoreSupport.await(firestoreSupport.firestore().runTransaction(transaction -> {
                var userRef = firestoreSupport.firestore().collection(USERS_COLLECTION).document(decodedToken.getUid());
                DocumentSnapshot snapshot = transaction.get(userRef).get();

                String email = resolveEmail(decodedToken);
                UserRole role = snapshot.exists()
                        ? enumValue(UserRole.class, stringValue(snapshot, "role"), UserRole.STUDENT)
                        : UserRole.STUDENT;
                Long legacyId = snapshot.exists() ? longValue(snapshot, "id") : null;
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("uid", decodedToken.getUid());
                data.put("firebaseUid", decodedToken.getUid());
                data.put("email", email);
                data.put("displayName", decodedToken.getName());
                data.put("avatarUrl", decodedToken.getPicture());
                data.put("role", role.name());
                data.put("updatedAtMillis", Instant.now().toEpochMilli());
                data.put("updatedAt", FieldValue.serverTimestamp());
                if (!snapshot.exists()) {
                    data.put("createdAtMillis", Instant.now().toEpochMilli());
                    data.put("createdAt", FieldValue.serverTimestamp());
                }
                transaction.set(userRef, data, SetOptions.merge());
                return toUser(legacyId, decodedToken, email, role);
            }));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not create Firestore user session", ex);
        }
    }

    private <T> T requiredBean(ObjectProvider<T> provider, String message) {
        try {
            return Optional.ofNullable(provider.getIfAvailable())
                    .orElseThrow(() -> new IllegalStateException(message));
        } catch (BeansException ex) {
            throw new IllegalStateException(message, ex);
        }
    }

    private User toUser(Long legacyId, FirebaseToken decodedToken, String email, UserRole role) {
        User user = new User();
        user.setId(legacyId);
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

    private String stringValue(DocumentSnapshot snapshot, String field) {
        Object value = snapshot.get(field);
        return value == null ? null : value.toString();
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

    private <E extends Enum<E>> E enumValue(Class<E> type, String value, E fallback) {
        if (!StringUtils.hasText(value)) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, value);
        } catch (IllegalArgumentException ex) {
            return fallback;
        }
    }
}
