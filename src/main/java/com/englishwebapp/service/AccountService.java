package com.englishwebapp.service;

import com.englishwebapp.dto.AccountSettingsForm;
import com.englishwebapp.dto.AccountSettingsView;
import com.englishwebapp.dto.PasswordChangeForm;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.UserRepository;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final UserRepository userRepository;
    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;

    @Transactional(readOnly = true)
    public AccountSettingsView getSettings(Long userId) {
        User user = findUser(userId);
        return new AccountSettingsView(
                user.getEmail(),
                user.getRole().name(),
                toForm(user));
    }

    @Transactional
    public User updateSettings(Long userId, AccountSettingsForm form) {
        User user = findUser(userId);
        user.setDisplayName(form.getDisplayName().trim());
        return userRepository.save(user);
    }

    @Transactional(readOnly = true)
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
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private AccountSettingsForm toForm(User user) {
        AccountSettingsForm form = new AccountSettingsForm();
        form.setDisplayName(StringUtils.hasText(user.getDisplayName()) ? user.getDisplayName() : user.getEmail());
        form.setAvatarUrl(user.getAvatarUrl());
        return form;
    }
}
