package com.englishwebapp.service;

import com.englishwebapp.dto.AdminContentImportResult;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.User;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.security.AppUserPrincipal;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AdminContentGenerationService {

    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final UserRepository userRepository;

    @Transactional
    public AdminContentImportResult generateQuestions(
            AppUserPrincipal principal,
            String module,
            Long testId,
            int part,
            String topic,
            int requestedCount,
            String licenseNote) {
        User user = currentUser(principal);
        int count = Math.max(1, Math.min(requestedCount, 20));
        SkillType skillType = skillType(module, part);
        int created = 0;
        for (int i = 1; i <= count; i++) {
            Question question = new Question();
            question.setPart(part);
            question.setSkillType(skillType);
            question.setDifficultyLevel(3);
            question.setType("MULTIPLE_CHOICE");
            question.setContent(buildQuestionContent(module, part, topic, i));
            question.setExplanation(buildExplanation(topic, i));
            question.setStatus(ContentStatus.DRAFT);
            question.setSourceType(SourceType.AI_GENERATED);
            question.setSourceNote("Generated TOEIC-style draft for Question Bank. Not copied from a real test.");
            question.setLicenseNote(StringUtils.hasText(licenseNote)
                    ? licenseNote
                    : "Synthetic TOEIC-style content generated for free learning use.");
            Question saved = questionRepository.save(question);
            saveOptions(saved, topic, i);
            created++;
        }
        return new AdminContentImportResult(0, created, 0, 0, 0);
    }

    private void saveOptions(Question question, String topic, int index) {
        String focus = cleanLabel(topic, "business English").toLowerCase();
        saveOption(question, "The speaker is asking for information about " + focus + ".", true);
        saveOption(question, "The speaker is cancelling a personal appointment.", false);
        saveOption(question, "The speaker is describing a completed vacation.", false);
        saveOption(question, "The speaker is reporting a technical accident.", false);
    }

    private void saveOption(Question question, String content, boolean correct) {
        AnswerOption option = new AnswerOption();
        option.setQuestion(question);
        option.setContent(content);
        option.setCorrect(correct);
        answerOptionRepository.save(option);
    }

    private String buildQuestionContent(String module, int part, String topic, int index) {
        String focus = cleanLabel(topic, "workplace communication");
        if ("listening".equalsIgnoreCase(module) && part <= 4) {
            return "Audio script draft " + index + ": A short workplace conversation about " + focus
                    + ". Question: What is the main purpose of the conversation?";
        }
        if (part == 5) {
            return "Question " + index + ": The manager asked the team to review the " + focus
                    + " report before it is sent to the client.";
        }
        if (part == 6) {
            return "Text completion draft " + index + ": Choose the best word or phrase to complete a business message about "
                    + focus + ".";
        }
        if (part == 7) {
            return "Reading passage draft " + index + ": A notice or email about " + focus
                    + ". Question: What is the reader asked to do next?";
        }
        return "TOEIC-style draft question " + index + " about " + focus + ".";
    }

    private String buildExplanation(String topic, int index) {
        return "Review note " + index
                + ": verify the stem, answer key, distractors, and level before publishing. Topic: "
                + cleanLabel(topic, "general TOEIC");
    }

    private String cleanLabel(String value, String fallback) {
        return StringUtils.hasText(value) ? value.trim() : fallback;
    }

    private SkillType skillType(String module, int part) {
        if ("listening".equalsIgnoreCase(module) || part <= 4) {
            return SkillType.LISTENING;
        }
        return SkillType.READING;
    }

    private User currentUser(AppUserPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
        return userRepository.findById(principal.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
