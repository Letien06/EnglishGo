package com.englishwebapp.service;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.repository.UserRepository;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class FirebaseAuthenticationService {

    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;
    private final UserRepository userRepository;
    private final AppProperties appProperties;

    @Transactional
    public User verifyAndProvisionUser(String idToken) {
        if (!StringUtils.hasText(idToken)) {
            throw new BadCredentialsException("Firebase ID token is required");
        }

        FirebaseAuth firebaseAuth = Optional.ofNullable(firebaseAuthProvider.getIfAvailable())
                .orElseThrow(() -> new IllegalStateException("Firebase Admin SDK is not configured"));

        FirebaseToken decodedToken;
        try {
            decodedToken = firebaseAuth.verifyIdToken(idToken);
        } catch (FirebaseAuthException ex) {
            throw new BadCredentialsException("Invalid Firebase ID token", ex);
        }

        return userRepository.findByFirebaseUid(decodedToken.getUid())
                .map(user -> updateUserProfile(user, decodedToken))
                .orElseGet(() -> createUser(decodedToken));
    }

    private User createUser(FirebaseToken decodedToken) {
        User user = new User();
        user.setFirebaseUid(decodedToken.getUid());
        user.setEmail(resolveEmail(decodedToken));
        user.setDisplayName(decodedToken.getName());
        user.setAvatarUrl(decodedToken.getPicture());
        user.setRole(resolveProvisionedRole(user.getEmail()));
        return userRepository.save(user);
    }

    private User updateUserProfile(User user, FirebaseToken decodedToken) {
        user.setEmail(resolveEmail(decodedToken));
        if (!StringUtils.hasText(user.getDisplayName())) {
            user.setDisplayName(decodedToken.getName());
        }
        if (!StringUtils.hasText(user.getAvatarUrl())) {
            user.setAvatarUrl(decodedToken.getPicture());
        }
        if (resolveProvisionedRole(user.getEmail()) == UserRole.ADMIN) {
            user.setRole(UserRole.ADMIN);
        }
        return userRepository.save(user);
    }

    private String resolveEmail(FirebaseToken decodedToken) {
        if (StringUtils.hasText(decodedToken.getEmail())) {
            return decodedToken.getEmail();
        }
        return decodedToken.getUid() + "@firebase.local";
    }

    private UserRole resolveProvisionedRole(String email) {
        if (!StringUtils.hasText(email)) {
            return UserRole.STUDENT;
        }
        boolean isAdmin = appProperties.getAdminEmails().stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .anyMatch(adminEmail -> adminEmail.equalsIgnoreCase(email));
        return isAdmin ? UserRole.ADMIN : UserRole.STUDENT;
    }
}
