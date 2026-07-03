package com.englishwebapp.service;

import com.englishwebapp.dto.DauToeicPartResponse;
import com.englishwebapp.dto.DauToeicQuestionResponse;
import com.englishwebapp.dto.DauToeicTestResponse;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.Test;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.zip.CRC32;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class DauToeicPracticeContentService {

    private static final int DEFAULT_DURATION_MINUTES = 120;

    private final DauToeicClientService dauToeicClientService;

    public Page<Test> findTests(String type, String difficulty, Pageable pageable) {
        List<Test> tests = dauToeicClientService.listTests(null).stream()
                .filter(test -> matches(type, test.name(), test.setName(), test.source()))
                .filter(test -> !StringUtils.hasText(difficulty)
                        || Objects.equals(String.valueOf(test.difficultyLevel()), difficulty.trim()))
                .sorted(Comparator.comparing(DauToeicTestResponse::orderIndex, Comparator.nullsLast(Integer::compareTo)))
                .map(this::toTest)
                .toList();
        int start = (int) Math.min(pageable.getOffset(), tests.size());
        int end = Math.min(start + pageable.getPageSize(), tests.size());
        return new PageImpl<>(tests.subList(start, end), pageable, tests.size());
    }

    public PracticeContent loadContent(Long routeTestId) {
        DauToeicTestResponse externalTest = resolveTest(routeTestId);
        Test test = toTest(externalTest);
        List<Question> questions = new ArrayList<>();
        Map<Long, List<AnswerOption>> optionsByQuestionId = new LinkedHashMap<>();
        Map<Long, String> correctAnswerByQuestionId = new LinkedHashMap<>();

        for (int part = 1; part <= 7; part++) {
            DauToeicPartResponse partContent = dauToeicClientService.getPart(externalTest.id(), part);
            for (DauToeicQuestionResponse externalQuestion : partContent.questions()) {
                Question question = toQuestion(test, externalQuestion);
                questions.add(question);
                List<AnswerOption> options = toOptions(question, externalQuestion);
                optionsByQuestionId.put(question.getId(), options);
                correctAnswerByQuestionId.put(question.getId(), cleanAnswer(externalQuestion.correctAnswer()));
            }
        }

        questions.sort(Comparator
                .comparing(Question::getPart, Comparator.nullsLast(Integer::compareTo))
                .thenComparing(Question::getId));
        return new PracticeContent(test, questions, optionsByQuestionId, correctAnswerByQuestionId);
    }

    public Long routeTestId(String externalId) {
        return stableId(externalId);
    }

    public Long routeQuestionId(String externalId) {
        return stableId(externalId);
    }

    public Long optionId(Long questionId, String letter) {
        return questionId * 10 + switch (letter) {
            case "A" -> 1;
            case "B" -> 2;
            case "C" -> 3;
            case "D" -> 4;
            default -> 0;
        };
    }

    public String optionLetter(Long optionId) {
        if (optionId == null) {
            return null;
        }
        return switch ((int) Math.floorMod(optionId, 10)) {
            case 1 -> "A";
            case 2 -> "B";
            case 3 -> "C";
            case 4 -> "D";
            default -> null;
        };
    }

    public Test toTest(DauToeicTestResponse externalTest) {
        Test test = new Test();
        test.setId(routeTestId(externalTest.id()));
        test.setTitle(defaultString(externalTest.name(), "Dau TOEIC test"));
        test.setType(defaultString(externalTest.setName(), defaultString(externalTest.source(), "DAUTOEIC")));
        test.setDifficulty(externalTest.difficultyLevel() == null ? null : String.valueOf(externalTest.difficultyLevel()));
        test.setDuration(DEFAULT_DURATION_MINUTES);
        test.setStatus(ContentStatus.PUBLISHED);
        test.setSourceType(SourceType.COMMUNITY);
        test.setSourceNote("dautoeic.com:" + externalTest.id());
        test.setPublishedAt(Instant.now());
        test.setUpdatedAt(Instant.now());
        return test;
    }

    private DauToeicTestResponse resolveTest(Long routeTestId) {
        return dauToeicClientService.listTests(null).stream()
                .filter(test -> routeTestId(test.id()).equals(routeTestId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
    }

    private Question toQuestion(Test test, DauToeicQuestionResponse externalQuestion) {
        Question question = new Question();
        question.setId(routeQuestionId(externalQuestion.id()));
        question.setTest(test);
        question.setPart(externalQuestion.part());
        question.setSkillType(externalQuestion.part() != null && externalQuestion.part() <= 4
                ? SkillType.LISTENING
                : SkillType.READING);
        question.setDifficultyLevel(Optional.ofNullable(externalQuestion.difficultyLevel()).orElse(3));
        question.setType("MULTIPLE_CHOICE");
        question.setContent(defaultString(externalQuestion.questionText(), "Question " + question.getId()));
        question.setAudioUrl(cleanMedia(externalQuestion.audioUrl()));
        question.setImageUrl(cleanMedia(externalQuestion.imageUrl()));
        question.setExplanation(defaultString(externalQuestion.explanationVi(), externalQuestion.explanationEn()));
        question.setStatus(ContentStatus.PUBLISHED);
        question.setSourceType(SourceType.COMMUNITY);
        question.setSourceNote("dautoeic.com:" + externalQuestion.id());
        question.setPublishedAt(Instant.now());
        question.setUpdatedAt(Instant.now());
        if (StringUtils.hasText(externalQuestion.passageText())) {
            QuestionGroup group = new QuestionGroup();
            group.setId(stableId(externalQuestion.passageId() == null ? externalQuestion.id() : externalQuestion.passageId()));
            group.setTest(test);
            group.setPart(externalQuestion.part());
            group.setSkillType(question.getSkillType());
            group.setTitle("Part " + externalQuestion.part());
            group.setPassageText(externalQuestion.passageText());
            group.setStatus(ContentStatus.PUBLISHED);
            question.setGroup(group);
        }
        return question;
    }

    private List<AnswerOption> toOptions(Question question, DauToeicQuestionResponse externalQuestion) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("A", externalQuestion.optionA());
        values.put("B", externalQuestion.optionB());
        values.put("C", externalQuestion.optionC());
        values.put("D", externalQuestion.optionD());
        String correct = cleanAnswer(externalQuestion.correctAnswer());
        return values.entrySet().stream()
                .filter(entry -> StringUtils.hasText(entry.getValue()))
                .map(entry -> {
                    AnswerOption option = new AnswerOption();
                    option.setId(optionId(question.getId(), entry.getKey()));
                    option.setQuestion(question);
                    option.setContent(entry.getKey() + ". " + entry.getValue());
                    option.setCorrect(entry.getKey().equals(correct));
                    return option;
                })
                .toList();
    }

    private Long stableId(String value) {
        if (StringUtils.hasText(value)) {
            try {
                return Long.parseLong(value.trim());
            } catch (NumberFormatException ignored) {
                CRC32 crc32 = new CRC32();
                crc32.update(value.trim().getBytes(StandardCharsets.UTF_8));
                long id = crc32.getValue();
                return id == 0 ? 1 : id;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "External id is required");
    }

    private boolean matches(String query, String... values) {
        if (!StringUtils.hasText(query)) {
            return true;
        }
        String needle = query.trim().toLowerCase();
        for (String value : values) {
            if (value != null && value.toLowerCase().contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private String cleanAnswer(String value) {
        return StringUtils.hasText(value) ? value.trim().substring(0, 1).toUpperCase() : null;
    }

    private String defaultString(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }

    private String cleanMedia(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value;
    }

    public record PracticeContent(
            Test test,
            List<Question> questions,
            Map<Long, List<AnswerOption>> optionsByQuestionId,
            Map<Long, String> correctAnswerByQuestionId) {
    }
}
