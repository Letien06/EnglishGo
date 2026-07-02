package com.englishwebapp.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.englishwebapp.dto.DashboardSummary;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserAttemptRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.VocabWordRepository;
import com.englishwebapp.security.AppUserPrincipal;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class HubServiceTest {

    @Mock
    private DashboardService dashboardService;

    @Mock
    private QuestionRepository questionRepository;

    @Mock
    private TestRepository testRepository;

    @Mock
    private UserAttemptRepository userAttemptRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private VocabWordRepository vocabWordRepository;

    @InjectMocks
    private HubService hubService;

    @Test
    void hubRendersForFirestoreSessionWithoutSqlUserRow() {
        AppUserPrincipal principal = new AppUserPrincipal(
                42L,
                "firebase-user",
                "learner@example.com",
                "Learner",
                UserRole.STUDENT);
        when(userRepository.findById(42L)).thenReturn(Optional.empty());
        when(dashboardService.getSummary(42L)).thenReturn(new DashboardSummary(
                0,
                BigDecimal.ZERO,
                0,
                0,
                List.of(),
                List.of()));
        when(userAttemptRepository.countByUserIdAndSubmittedAtBetween(
                org.mockito.Mockito.eq(42L),
                org.mockito.Mockito.any(Instant.class),
                org.mockito.Mockito.any(Instant.class))).thenReturn(0L);
        when(testRepository.count()).thenReturn(75L);
        when(questionRepository.count()).thenReturn(997L);
        when(vocabWordRepository.count()).thenReturn(0L);

        var hub = hubService.getHub(principal);

        assertThat(hub.greetingName()).isEqualTo("Learner");
        assertThat(hub.targetScore()).isNull();
        assertThat(hub.level()).isNull();
        assertThat(hub.availableTests()).isEqualTo(75);
        assertThat(hub.availableQuestions()).isEqualTo(997);
    }
}
