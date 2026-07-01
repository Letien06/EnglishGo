package com.englishwebapp.service;

import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.TestQuestion;
import com.englishwebapp.entity.ToeicPart;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestQuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.security.AppUserPrincipal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AdminTestAssemblyService {

    private final TestRepository testRepository;
    private final TestQuestionRepository testQuestionRepository;
    private final QuestionRepository questionRepository;
    private final UserRepository userRepository;

    @Transactional
    public Test assembleTest(
            AppUserPrincipal principal,
            String title,
            int duration,
            String difficulty,
            int listeningCount,
            int readingCount,
            ContentStatus status) {
        User user = currentUser(principal);
        List<Question> selected = new ArrayList<>();
        selected.addAll(selectQuestions(SkillType.LISTENING, List.of(ToeicPart.PART_1, ToeicPart.PART_2, ToeicPart.PART_3, ToeicPart.PART_4), listeningCount));
        selected.addAll(selectQuestions(SkillType.READING, List.of(ToeicPart.PART_5, ToeicPart.PART_6, ToeicPart.PART_7), readingCount));
        if (selected.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chưa có câu hỏi PUBLISHED để ghép đề.");
        }

        Test test = new Test();
        test.setTitle(StringUtils.hasText(title) ? title.trim() : "ENGLISHGO TOEIC Practice");
        test.setType("TOEIC");
        test.setDuration(Math.max(5, duration));
        test.setDifficulty(StringUtils.hasText(difficulty) ? difficulty.trim() : "Question Bank");
        test.setCreatedBy(user);
        test.setStatus(status == ContentStatus.PUBLISHED ? ContentStatus.PUBLISHED : ContentStatus.DRAFT);
        test.setSourceType(SourceType.MANUAL);
        test.setSourceNote("Assembled from ENGLISHGO Question Bank.");
        test.setLicenseNote("Free learning content. Questions are linked from the internal Question Bank.");
        if (test.getStatus() == ContentStatus.PUBLISHED) {
            test.setPublishedAt(Instant.now());
            test.setReviewedAt(Instant.now());
            test.setReviewedBy(user);
        }
        Test saved = testRepository.save(test);

        int order = 1;
        for (Question question : selected) {
            TestQuestion link = new TestQuestion();
            link.setTest(saved);
            link.setQuestion(question);
            link.setDisplayOrder(order++);
            testQuestionRepository.save(link);
        }
        return saved;
    }

    private List<Question> selectQuestions(SkillType skillType, List<ToeicPart> parts, int requestedCount) {
        int count = Math.max(0, requestedCount);
        if (count == 0) {
            return List.of();
        }
        List<Question> selected = new ArrayList<>();
        for (ToeicPart part : parts) {
            if (selected.size() >= count) {
                break;
            }
            int remaining = count - selected.size();
            selected.addAll(questionRepository.findForQuestionBank(
                    skillType,
                    part.number(),
                    ContentStatus.PUBLISHED,
                    null,
                    PageRequest.of(0, remaining)).getContent());
        }
        return selected;
    }

    private User currentUser(AppUserPrincipal principal) {
        if (principal == null || principal.id() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
        return userRepository.findById(principal.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
