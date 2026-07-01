package com.englishwebapp.controller;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.dto.ApiResponse;
import com.englishwebapp.dto.AuthenticatedUserResponse;
import com.englishwebapp.dto.FirebaseLoginRequest;
import com.englishwebapp.entity.User;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
    public String login(@AuthenticationPrincipal AppUserPrincipal user, Model model) {
        if (user != null) {
            return "redirect:/vocab";
        }
        model.addAttribute("firebase", appProperties.getFirebase());
        model.addAttribute("mode", "login");
        return "auth/login";
    }

    @GetMapping({"/signup", "/register"})
    public String signup(@AuthenticationPrincipal AppUserPrincipal user, Model model) {
        if (user != null) {
            return "redirect:/vocab";
        }
        model.addAttribute("firebase", appProperties.getFirebase());
        model.addAttribute("mode", "signup");
        return "auth/login";
    }

    @GetMapping("/auth/status")
    @ResponseBody
    public ResponseEntity<ApiResponse<AuthenticatedUserResponse>> status(
            @AuthenticationPrincipal AppUserPrincipal user) {
        if (user == null) {
            return ResponseEntity.ok(ApiResponse.ok(null));
        }
        return ResponseEntity.ok(ApiResponse.ok(new AuthenticatedUserResponse(
                user.id(),
                user.email(),
                user.displayName(),
                user.role().name())));
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
