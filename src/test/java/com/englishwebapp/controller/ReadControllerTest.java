package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.entity.UserRole;
import com.englishwebapp.security.AppUserPrincipal;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.LearnerContentService;
import java.util.List;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ReadController.class)
@AutoConfigureMockMvc(addFilters = false)
class ReadControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @MockBean
    private LearnerContentService learnerContentService;

    @BeforeEach
    void setUp() {
        when(learnerContentService.findPublishedQuestions(any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of()));
        when(learnerContentService.findOptionsByQuestionId(any())).thenReturn(Map.of());
        when(learnerContentService.findPublishedLessons(any())).thenReturn(new PageImpl<>(List.of()));
    }

    @Test
    void readPageRendersFivePartLayoutForGuests() throws Exception {
        mockMvc.perform(get("/read"))
                .andExpect(status().isOk())
                .andExpect(view().name("read/index"))
                .andExpect(content().string(Matchers.containsString("read-page")))
                .andExpect(content().string(Matchers.containsString("read-random-card")))
                .andExpect(content().string(Matchers.containsString("Chưa có bài học")));
    }

    @Test
    void readPageRendersAuthenticatedHeader() throws Exception {
        AppUserPrincipal principal = new AppUserPrincipal(
                1L,
                "firebase-user",
                "learner@example.com",
                "Learner",
                UserRole.STUDENT);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                principal,
                null,
                List.of());

        try {
            SecurityContextHolder.getContext().setAuthentication(authentication);

            mockMvc.perform(get("/read").param("part", "part7"))
                    .andExpect(status().isOk())
                    .andExpect(view().name("read/index"))
                    .andExpect(content().string(Matchers.containsString("dash-actions")))
                    .andExpect(content().string(Matchers.containsString("read-hero-card")));
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
