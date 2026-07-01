package com.englishwebapp.service;

import com.englishwebapp.dto.AccountSettingsForm;
import com.englishwebapp.dto.AccountSettingsView;
import com.englishwebapp.dto.PasswordChangeForm;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AccountService {

    private static final String USERS_COLLECTION = "users";

    private final ObjectProvider<Firestore> firestoreProvider;
    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;

    public AccountSettingsView getSettings(Long userId) {
        User user = findUser(userId);
        return new AccountSettingsView(
                user.getEmail(),
                user.getRole().name(),
                toForm(user));
    }

    public User updateSettings(Long userId, AccountSettingsForm form) {
        User user = findUser(userId);
        String displayName = form.getDisplayName().trim();
        String avatarUrl = cleanOptional(form.getAvatarUrl());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("displayName", displayName);
        data.put("avatarUrl", avatarUrl);
        data.put("updatedAtMillis", Instant.now().toEpochMilli());
        try {
            await(firestore()
                    .collection(USERS_COLLECTION)
                    .document(user.getFirebaseUid())
                    .set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not update account profile", ex);
        }

        user.setDisplayName(displayName);
        user.setAvatarUrl(avatarUrl);
        return user;
    }

    public void changePassword(Long userId, PasswordChangeForm form) {
        User user = findUser(userId);
        FirebaseAuth firebaseAuth = firebaseAuthProvider.getIfAvailable();
        if (firebaseAuth == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Firebase Admin SDK is not configured");
        }

        try {
            firebaseAuth.updateUser(new UserRecord.UpdateRequest(user.getFirebaseUid())
                    .setPassword(form.getNewPassword()));
        } catch (FirebaseAuthException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not update password");
        }
    }

    private User findUser(Long userId) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
        try {
            return await(firestore().collection(USERS_COLLECTION).get()).getDocuments().stream()
                    .filter(snapshot -> userId.equals(longValue(snapshot, "id")))
                    .findFirst()
                    .map(this::toUser)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not load account profile", ex);
        }
    }

    private User toUser(DocumentSnapshot snapshot) {
        User user = new User();
        user.setId(longValue(snapshot, "id"));
        user.setFirebaseUid(defaultString(stringValue(snapshot, "firebaseUid"), snapshot.getId()));
        user.setEmail(defaultString(stringValue(snapshot, "email"), user.getFirebaseUid() + "@firebase.local"));
        user.setDisplayName(stringValue(snapshot, "displayName"));
        user.setAvatarUrl(stringValue(snapshot, "avatarUrl"));
        user.setRole(enumValue(UserRole.class, stringValue(snapshot, "role"), UserRole.STUDENT));
        return user;
    }

    private AccountSettingsForm toForm(User user) {
        AccountSettingsForm form = new AccountSettingsForm();
        form.setDisplayName(StringUtils.hasText(user.getDisplayName()) ? user.getDisplayName() : user.getEmail());
        form.setAvatarUrl(user.getAvatarUrl());
        return form;
    }

    private Firestore firestore() {
        return Optional.ofNullable(firestoreProvider.getIfAvailable())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Firestore is not configured"));
    }

    private <T> T await(ApiFuture<T> future) throws InterruptedException, ExecutionException {
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw ex;
        }
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

    private String stringValue(DocumentSnapshot snapshot, String field) {
        Object value = snapshot.get(field);
        return value == null ? null : value.toString();
    }

    private String defaultString(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }

    private String cleanOptional(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
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
