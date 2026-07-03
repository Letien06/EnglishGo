package com.englishwebapp.service;

import com.englishwebapp.dto.AccountSettingsForm;
import com.englishwebapp.dto.AccountSettingsView;
import com.englishwebapp.dto.PasswordChangeForm;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.service.firestore.FirestoreSupport;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.SetOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final FirestoreSupport firestoreSupport;
    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;

    public AccountSettingsView getSettings(String uid) {
        User user = findUser(uid);
        return new AccountSettingsView(
                user.getEmail(),
                user.getRole().name(),
                toForm(user));
    }

    public User updateSettings(String uid, AccountSettingsForm form) {
        User user = findUser(uid);
        String displayName = form.getDisplayName().trim();
        String avatarUrl = cleanOptional(form.getAvatarUrl());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("displayName", displayName);
        data.put("avatarUrl", avatarUrl);
        data.put("updatedAt", FieldValue.serverTimestamp());
        try {
            firestoreSupport.await(firestoreSupport.userDocument(uid).set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not update account profile", ex);
        }

        user.setDisplayName(displayName);
        user.setAvatarUrl(avatarUrl);
        return user;
    }

    public void changePassword(String uid, PasswordChangeForm form) {
        User user = findUser(uid);
        FirebaseAuth firebaseAuth = firebaseAuthProvider.getIfAvailable();
        if (firebaseAuth == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Firebase authentication SDK is not configured");
        }

        try {
            firebaseAuth.updateUser(new UserRecord.UpdateRequest(user.getFirebaseUid())
                    .setPassword(form.getNewPassword()));
        } catch (FirebaseAuthException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not update password");
        }
    }

    private User findUser(String uid) {
        try {
            DocumentSnapshot snapshot = firestoreSupport.await(firestoreSupport.userDocument(uid).get());
            if (!snapshot.exists()) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
            }
            return toUser(snapshot);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw firestoreSupport.failure("Could not load account profile", ex);
        }
    }

    private User toUser(DocumentSnapshot snapshot) {
        User user = new User();
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
