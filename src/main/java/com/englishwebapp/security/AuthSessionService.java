package com.englishwebapp.security;

import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.util.List;
import java.util.Optional;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Service;

@Service
public class AuthSessionService {

    private static final String USER_ID = "AUTH_USER_ID";
    private static final String FIREBASE_UID = "AUTH_FIREBASE_UID";
    private static final String EMAIL = "AUTH_EMAIL";
    private static final String DISPLAY_NAME = "AUTH_DISPLAY_NAME";
    private static final String ROLE = "AUTH_ROLE";

    public void storeAuthenticatedUser(HttpServletRequest request, User user) {
        HttpSession session = request.getSession(true);
        session.setAttribute(USER_ID, user.getId());
        session.setAttribute(FIREBASE_UID, user.getFirebaseUid());
        session.setAttribute(EMAIL, user.getEmail());
        session.setAttribute(DISPLAY_NAME, user.getDisplayName());
        session.setAttribute(ROLE, user.getRole().name());
    }

    public Optional<Authentication> getAuthentication(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(USER_ID) == null || session.getAttribute(ROLE) == null) {
            return Optional.empty();
        }

        UserRole role = UserRole.valueOf((String) session.getAttribute(ROLE));
        AppUserPrincipal principal = new AppUserPrincipal(
                (Long) session.getAttribute(USER_ID),
                (String) session.getAttribute(FIREBASE_UID),
                (String) session.getAttribute(EMAIL),
                (String) session.getAttribute(DISPLAY_NAME),
                role);

        return Optional.of(new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
    }

    public void clear(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }
}
