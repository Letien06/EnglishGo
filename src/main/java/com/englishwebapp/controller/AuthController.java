package com.englishwebapp.controller;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.AuthenticatedUserResponse;
import com.englishwebapp.dto.FirebaseLoginRequest;
import com.englishwebapp.entity.User;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@RequiredArgsConstructor
public class AuthController {

    private final AppProperties appProperties;
    private final FirebaseAuthenticationService firebaseAuthenticationService;
    private final AuthSessionService authSessionService;

    @GetMapping("/login")
    public String login(Model model) {
        model.addAttribute("firebase", appProperties.getFirebase());
        return "auth/login";
    }

    @PostMapping("/auth/session")
    @ResponseBody
    public ResponseEntity<ApiResponse<AuthenticatedUserResponse>> createSession(
            @Valid @RequestBody FirebaseLoginRequest request,
            HttpServletRequest httpServletRequest) {
        User user = firebaseAuthenticationService.verifyAndProvisionUser(request.idToken());
        authSessionService.storeAuthenticatedUser(httpServletRequest, user);
        return ResponseEntity.ok(ApiResponse.ok(AuthenticatedUserResponse.from(user)));
    }

    @PostMapping("/auth/logout")
    @ResponseBody
    public ResponseEntity<ApiResponse<Void>> logout(HttpServletRequest request) {
        authSessionService.clear(request);
        return ResponseEntity.ok(ApiResponse.ok(null));
    }
}
