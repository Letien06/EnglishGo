package com.englishwebapp.security;

import com.englishwebapp.entity.User;
import com.englishwebapp.service.FirebaseAuthenticationService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@RequiredArgsConstructor
public class FirebaseAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final FirebaseAuthenticationService firebaseAuthenticationService;
    private final AuthSessionService authSessionService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            authSessionService.getAuthentication(request)
                    .ifPresentOrElse(
                            authentication -> setAuthenticationDetails(authentication, request),
                            () -> authenticateBearerToken(request, response));
            if (response.isCommitted()) {
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private void authenticateBearerToken(HttpServletRequest request, HttpServletResponse response) {
        String authorization = request.getHeader("Authorization");
        if (!StringUtils.hasText(authorization) || !authorization.startsWith(BEARER_PREFIX)) {
            return;
        }

        String idToken = authorization.substring(BEARER_PREFIX.length());
        try {
            User user = firebaseAuthenticationService.verifyAndProvisionUser(idToken);
            authSessionService.storeAuthenticatedUser(request, user);
            authSessionService.getAuthentication(request)
                    .ifPresent(authentication -> setAuthenticationDetails(authentication, request));
        } catch (BadCredentialsException ex) {
            writeError(response, HttpStatus.UNAUTHORIZED, ex.getMessage());
        } catch (IllegalStateException ex) {
            writeError(response, HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage());
        }
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String message) {
        try {
            response.setStatus(status.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"success\":false,\"data\":null,\"error\":\"" + message + "\"}");
            response.flushBuffer();
        } catch (IOException ex) {
            throw new IllegalStateException("Could not write authentication error response", ex);
        }
    }

    private void setAuthenticationDetails(Authentication authentication, HttpServletRequest request) {
        if (authentication instanceof org.springframework.security.authentication.UsernamePasswordAuthenticationToken token) {
            token.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        }
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
