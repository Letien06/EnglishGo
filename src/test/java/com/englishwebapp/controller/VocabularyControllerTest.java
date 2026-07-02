package com.englishwebapp.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.view;

import com.englishwebapp.dto.MyVocabSetCard;
import com.englishwebapp.dto.VocabSetCard;
import com.englishwebapp.dto.VocabSetSession;
import com.englishwebapp.dto.VocabWordCard;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.security.AuthSessionService;
import com.englishwebapp.service.FirebaseAuthenticationService;
import com.englishwebapp.service.VocabService;
import java.util.List;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(VocabularyController.class)
@AutoConfigureMockMvc(addFilters = false)
class VocabularyControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private VocabService vocabService;

    @MockBean
    private FirebaseAuthenticationService firebaseAuthenticationService;

    @MockBean
    private AuthSessionService authSessionService;

    @BeforeEach
    void setUp() {
        when(vocabService.findSetCards(isNull(), any())).thenReturn(new PageImpl<>(List.of(
                new VocabSetCard(1L, "Contracts", "600 TU VUNG TOEIC", "Beginner", 12, false))));
        when(vocabService.findMySetCards(isNull())).thenReturn(List.of());
        when(vocabService.findMySetCards(isNull(), isNull())).thenReturn(List.of());
        when(vocabService.findMyFolderCards(isNull())).thenReturn(List.of());
        when(vocabService.findPracticeSetOptions(isNull())).thenReturn(List.of(
                new VocabSetCard(1L, "Contracts", "600 TU VUNG TOEIC", "Beginner", 12, false)));
        when(vocabService.totalWords(isNull())).thenReturn(7713L);
        when(vocabService.learnedWords(null)).thenReturn(0L);
        when(vocabService.masteredWords(null)).thenReturn(0L);
        when(vocabService.dueWords(null)).thenReturn(0L);
        when(vocabService.getFilteredSession(eq(1L), isNull(), anyString(), anyString(), anyString())).thenReturn(new VocabSetSession(vocabSet(), List.of(
                new VocabWordCard(1L, "contract", "hop dong", "NOUN", "/kantraekt/", "The contract is ready.", null),
                new VocabWordCard(2L, "invoice", "hoa don", "NOUN", null, "Please check the invoice.", null))));
    }

    @Test
    void vocabPageRendersLearningDemo() throws Exception {
        mockMvc.perform(get("/vocab"))
                .andExpect(status().isOk())
                .andExpect(view().name("vocab/sets"))
                .andExpect(content().string(Matchers.containsString("vocab-hero")))
                .andExpect(content().string(Matchers.containsString("Học (demo)")))
                .andExpect(content().string(Matchers.containsString("vocab-demo-panel")));
    }

    @Test
    void vocabularyAliasRendersTheSamePage() throws Exception {
        mockMvc.perform(get("/vocabulary").param("tab", "progress"))
                .andExpect(status().isOk())
                .andExpect(view().name("vocab/sets"))
                .andExpect(content().string(Matchers.containsString("vocab-progress")));
    }

    @Test
    void myVocabularyTabRendersUserSets() throws Exception {
        when(vocabService.findMySetCards(isNull())).thenReturn(List.of(
                new MyVocabSetCard(5L, "Bộ từ vựng của tôi", "Bộ riêng", "⭐", null, null, 32, 1, 3)));
        when(vocabService.findMySetCards(isNull(), isNull())).thenReturn(List.of(
                new MyVocabSetCard(5L, "Bộ từ vựng của tôi", "Bộ riêng", "⭐", null, null, 32, 1, 3)));

        mockMvc.perform(get("/vocab").param("tab", "my"))
                .andExpect(status().isOk())
                .andExpect(view().name("vocab/sets"))
                .andExpect(content().string(Matchers.containsString("Bộ từ vựng của tôi")))
                .andExpect(content().string(Matchers.containsString("vocab-my-set-card")));
    }

    @Test
    void flashcardPageRendersStudyModes() throws Exception {
        mockMvc.perform(get("/vocab/sets/1/flashcards").param("mode", "quiz"))
                .andExpect(status().isOk())
                .andExpect(view().name("vocab/flashcards"))
                .andExpect(content().string(Matchers.containsString("mode-picker")))
                .andExpect(content().string(Matchers.containsString("Quiz")))
                .andExpect(content().string(Matchers.containsString("vocab-study-surface")));
    }

    @Test
    void reviewSessionRedirectsAnonymousUsersToLogin() throws Exception {
        mockMvc.perform(get("/vocab/review"))
                .andExpect(status().is3xxRedirection());
    }

    private VocabSet vocabSet() {
        VocabSet set = new VocabSet();
        set.setId(1L);
        set.setTitle("Contracts");
        set.setTopic("600 TU VUNG TOEIC");
        set.setLevel("Beginner");
        return set;
    }
}
