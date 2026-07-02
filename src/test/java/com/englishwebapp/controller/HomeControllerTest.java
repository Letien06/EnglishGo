package com.englishwebapp.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.dto.HubView;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.HubService;
import com.englishwebapp.service.VocabService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HomeController.class)
@AutoConfigureMockMvc(addFilters = false)
class HomeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private HubService hubService;

    @MockBean
    private VocabService vocabService;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @Test
    void guestHomeRendersLanding() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(view().name("home"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("ENGLISHGO")));
    }

    @Test
    void authenticatedHomeRendersDashboard() throws Exception {
        AppUserPrincipal principal = new AppUserPrincipal(
                1L,
                "firebase-user",
                "learner@example.com",
                "Tiến Lê",
                UserRole.STUDENT);
        when(hubService.getHub(principal)).thenReturn(new HubView(
                "Tiến Lê",
                1,
                0,
                0,
                1,
                0,
                BigDecimal.ZERO,
                null,
                null,
                0,
                75,
                997,
                0,
                List.of(),
                List.of(),
                List.of()));

        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of());

        try {
            SecurityContextHolder.getContext().setAuthentication(authentication);

            mockMvc.perform(get("/"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("hub/index"))
                    .andExpect(content().string(org.hamcrest.Matchers.containsString("dash-body")))
                    .andExpect(content().string(org.hamcrest.Matchers.containsString("goal-pill")));
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
