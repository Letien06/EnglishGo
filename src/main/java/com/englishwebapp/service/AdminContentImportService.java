package com.englishwebapp.service;

import com.englishwebapp.dto.AdminContentImportResult;
import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Lesson;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.QuestionGroup;
import com.englishwebapp.entity.SkillType;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.entity.VocabWord;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.LessonRepository;
import com.englishwebapp.repository.QuestionGroupRepository;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.VocabSetRepository;
import com.englishwebapp.repository.VocabWordRepository;
import com.englishwebapp.security.AppUserPrincipal;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AdminContentImportService {

    private static final DateTimeFormatter IMPORT_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmm");

    private final TestRepository testRepository;
    private final QuestionRepository questionRepository;
    private final QuestionGroupRepository questionGroupRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final VocabSetRepository vocabSetRepository;
    private final VocabWordRepository vocabWordRepository;
    private final LessonRepository lessonRepository;
    private final UserRepository userRepository;

    @Transactional
    public AdminContentImportResult importFile(
            AppUserPrincipal principal,
            String module,
            Long testId,
            Long vocabSetId,
            String topic,
            String licenseNote,
            MultipartFile file) {
        User user = currentUser(principal);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required");
        }
        String filename = StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : "import";
        String text = extractText(file, filename);
        if (!StringUtils.hasText(text)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File has no readable text");
        }
        if (filename.toLowerCase(Locale.ROOT).endsWith(".csv")) {
            return importCsv(user, module, testId, vocabSetId, topic, licenseNote, filename, text);
        }
        if ("vocabulary".equalsIgnoreCase(module)) {
            return importVocabularyText(vocabSetId, topic, licenseNote, filename, text);
        }
        return importTextAsQuestionGroup(module, topic, filename, text);
    }

    private AdminContentImportResult importCsv(
            User user,
            String module,
            Long testId,
            Long vocabSetId,
            String topic,
            String licenseNote,
            String filename,
            String csvText) {
        List<List<String>> rows = parseCsv(csvText);
        if (rows.size() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CSV must include a header row and data rows");
        }
        Map<String, Integer> header = headerMap(rows.get(0));
        if ("vocabulary".equalsIgnoreCase(module)) {
            return importVocabularyCsv(vocabSetId, topic, licenseNote, filename, rows, header);
        }
        return importQuestionCsv(user, module, testId, topic, licenseNote, filename, rows, header);
    }

    private AdminContentImportResult importQuestionCsv(
            User user,
            String module,
            Long testId,
            String topic,
            String licenseNote,
            String filename,
            List<List<String>> rows,
            Map<String, Integer> header) {
        int questionCount = 0;
        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            String content = cell(row, header, "content");
            if (!StringUtils.hasText(content)) {
                continue;
            }
            int part = parseInt(cell(row, header, "part"), defaultPart(module));
            Question question = new Question();
            question.setPart(part);
            question.setSkillType(skillType(cell(row, header, "skill_type", "skill"), module, part));
            question.setDifficultyLevel(parseInt(cell(row, header, "difficulty_level", "difficulty"), 3));
            question.setType(valueOrDefault(cell(row, header, "type"), "MULTIPLE_CHOICE"));
            question.setContent(content);
            question.setAudioUrl(emptyToNull(cell(row, header, "audio_url", "audio")));
            question.setImageUrl(emptyToNull(cell(row, header, "image_url", "image")));
            question.setExplanation(emptyToNull(cell(row, header, "explanation")));
            question.setStatus(ContentStatus.DRAFT);
            question.setSourceType(SourceType.CSV_IMPORT);
            question.setSourceNote("Imported into Question Bank from " + filename);
            question.setLicenseNote(licenseNote);
            Question saved = questionRepository.save(question);
            String correct = valueOrDefault(cell(row, header, "correct_option", "correct"), "A");
            saveOption(saved, cell(row, header, "option_a", "a"), "A".equalsIgnoreCase(correct));
            saveOption(saved, cell(row, header, "option_b", "b"), "B".equalsIgnoreCase(correct));
            saveOption(saved, cell(row, header, "option_c", "c"), "C".equalsIgnoreCase(correct));
            saveOption(saved, cell(row, header, "option_d", "d"), "D".equalsIgnoreCase(correct));
            questionCount++;
        }
        return new AdminContentImportResult(0, questionCount, 0, 0, 0);
    }

    private AdminContentImportResult importVocabularyCsv(
            Long vocabSetId,
            String topic,
            String licenseNote,
            String filename,
            List<List<String>> rows,
            Map<String, Integer> header) {
        VocabSet set = vocabSetId != null
                ? vocabSetRepository.findById(vocabSetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"))
                : createImportVocabSet(topic, filename, licenseNote);
        int wordCount = 0;
        for (int i = 1; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            String word = cell(row, header, "word");
            String meaning = cell(row, header, "meaning", "definition");
            if (!StringUtils.hasText(word) || !StringUtils.hasText(meaning)) {
                continue;
            }
            VocabWord vocabWord = new VocabWord();
            vocabWord.setSet(set);
            vocabWord.setWord(word);
            vocabWord.setMeaning(meaning);
            vocabWord.setPhonetic(emptyToNull(cell(row, header, "phonetic")));
            vocabWord.setExample(emptyToNull(cell(row, header, "example")));
            vocabWord.setAudioUrl(emptyToNull(cell(row, header, "audio_url", "audio")));
            vocabWord.setStatus(ContentStatus.PENDING_REVIEW);
            vocabWord.setSourceType(SourceType.CSV_IMPORT);
            vocabWord.setSourceNote("Imported from " + filename);
            vocabWord.setLicenseNote(licenseNote);
            vocabWordRepository.save(vocabWord);
            wordCount++;
        }
        return new AdminContentImportResult(0, 0, 0, vocabSetId == null ? 1 : 0, wordCount);
    }

    private AdminContentImportResult importVocabularyText(
            Long vocabSetId,
            String topic,
            String licenseNote,
            String filename,
            String text) {
        VocabSet set = vocabSetId != null
                ? vocabSetRepository.findById(vocabSetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"))
                : createImportVocabSet(topic, filename, licenseNote);
        int wordCount = 0;
        for (String line : text.split("\\R")) {
            String trimmed = line.trim();
            if (!StringUtils.hasText(trimmed)) {
                continue;
            }
            String[] parts = trimmed.split("\\s*[-:,;]\\s*", 2);
            if (parts.length < 2 || !StringUtils.hasText(parts[0]) || !StringUtils.hasText(parts[1])) {
                continue;
            }
            VocabWord word = new VocabWord();
            word.setSet(set);
            word.setWord(parts[0].trim());
            word.setMeaning(parts[1].trim());
            word.setStatus(ContentStatus.PENDING_REVIEW);
            word.setSourceType(SourceType.PDF_IMPORT);
            word.setSourceNote("Imported from text/PDF file " + filename);
            word.setLicenseNote(licenseNote);
            vocabWordRepository.save(word);
            wordCount++;
        }
        return new AdminContentImportResult(0, 0, 0, vocabSetId == null ? 1 : 0, wordCount);
    }

    private AdminContentImportResult importTextAsLesson(
            String module,
            String topic,
            String licenseNote,
            String filename,
            String text) {
        Lesson lesson = new Lesson();
        lesson.setTitle("Import draft - " + filename);
        lesson.setTopic(valueOrDefault(topic, module));
        lesson.setContent(text.trim());
        lesson.setStatus(ContentStatus.PENDING_REVIEW);
        lesson.setSourceType(filename.toLowerCase(Locale.ROOT).endsWith(".pdf")
                ? SourceType.PDF_IMPORT
                : SourceType.MANUAL);
        lesson.setSourceNote("Imported from " + filename + ". Admin must review rights and formatting before publishing.");
        lesson.setLicenseNote(licenseNote);
        lessonRepository.save(lesson);
        return new AdminContentImportResult(0, 0, 1, 0, 0);
    }

    private AdminContentImportResult importTextAsQuestionGroup(
            String module,
            String topic,
            String filename,
            String text) {
        int part = "listening".equalsIgnoreCase(module) ? 3 : 7;
        QuestionGroup group = new QuestionGroup();
        group.setSkillType("listening".equalsIgnoreCase(module) ? SkillType.LISTENING : SkillType.READING);
        group.setPart(part);
        group.setTitle("Import Draft - " + valueOrDefault(topic, filename));
        group.setDifficultyLevel(3);
        if (group.getSkillType() == SkillType.READING) {
            group.setPassageHtml(toParagraphHtml(text));
            group.setPassageText(text.trim());
        } else {
            group.setPassageText(text.trim());
        }
        group.setStatus(ContentStatus.DRAFT);
        questionGroupRepository.save(group);
        return new AdminContentImportResult(0, 0, 1, 0, 0);
    }

    private Test createImportTest(User user, String module, String topic, String filename) {
        Test test = new Test();
        test.setTitle("Import Draft - " + valueOrDefault(topic, module) + " - " + LocalDateTime.now().format(IMPORT_FORMAT));
        test.setType("TOEIC");
        test.setDuration(120);
        test.setDifficulty(filename);
        test.setCreatedBy(user);
        test.setStatus(ContentStatus.DRAFT);
        test.setSourceType(SourceType.CSV_IMPORT);
        test.setSourceNote("Imported question container from " + filename);
        test.setLicenseNote("Publish only after admin review.");
        return testRepository.save(test);
    }

    private VocabSet createImportVocabSet(String topic, String filename, String licenseNote) {
        VocabSet set = new VocabSet();
        set.setTitle("Import Draft - " + filename);
        set.setTopic(valueOrDefault(topic, "TOEIC vocabulary"));
        set.setLevel("TOEIC");
        set.setStatus(ContentStatus.PENDING_REVIEW);
        set.setSourceType(SourceType.CSV_IMPORT);
        set.setSourceNote("Imported vocabulary container from " + filename);
        set.setLicenseNote(licenseNote);
        return vocabSetRepository.save(set);
    }

    private void saveOption(Question question, String content, boolean correct) {
        if (!StringUtils.hasText(content)) {
            return;
        }
        AnswerOption option = new AnswerOption();
        option.setQuestion(question);
        option.setContent(content);
        option.setCorrect(correct);
        answerOptionRepository.save(option);
    }

    private String extractText(MultipartFile file, String filename) {
        try {
            if (filename.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
                try (InputStream inputStream = file.getInputStream();
                     PDDocument document = PDDocument.load(inputStream)) {
                    return new PDFTextStripper().getText(document);
                }
            }
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot read import file", exception);
        }
    }

    private List<List<String>> parseCsv(String csv) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < csv.length(); i++) {
            char c = csv.charAt(i);
            if (c == '"') {
                if (quoted && i + 1 < csv.length() && csv.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (c == ',' && !quoted) {
                row.add(cell.toString().trim());
                cell.setLength(0);
            } else if ((c == '\n' || c == '\r') && !quoted) {
                if (c == '\r' && i + 1 < csv.length() && csv.charAt(i + 1) == '\n') {
                    i++;
                }
                row.add(cell.toString().trim());
                cell.setLength(0);
                if (row.stream().anyMatch(StringUtils::hasText)) {
                    rows.add(row);
                }
                row = new ArrayList<>();
            } else {
                cell.append(c);
            }
        }
        row.add(cell.toString().trim());
        if (row.stream().anyMatch(StringUtils::hasText)) {
            rows.add(row);
        }
        return rows;
    }

    private Map<String, Integer> headerMap(List<String> headerRow) {
        Map<String, Integer> header = new HashMap<>();
        for (int i = 0; i < headerRow.size(); i++) {
            header.put(normalizeHeader(headerRow.get(i)), i);
        }
        return header;
    }

    private String cell(List<String> row, Map<String, Integer> header, String... keys) {
        for (String key : keys) {
            Integer index = header.get(normalizeHeader(key));
            if (index != null && index < row.size()) {
                return row.get(index);
            }
        }
        return "";
    }

    private String normalizeHeader(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT).replace("-", "_").replace(" ", "_");
    }

    private String emptyToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String valueOrDefault(String value, String fallback) {
        return StringUtils.hasText(value) ? value.trim() : fallback;
    }

    private int parseInt(String value, int fallback) {
        try {
            return StringUtils.hasText(value) ? Integer.parseInt(value.trim()) : fallback;
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private int defaultPart(String module) {
        if ("listening".equalsIgnoreCase(module)) {
            return 1;
        }
        return 5;
    }

    private SkillType skillType(String explicit, String module, int part) {
        if (StringUtils.hasText(explicit)) {
            try {
                return SkillType.valueOf(explicit.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ignored) {
                // Fall through to part/module inference.
            }
        }
        if ("listening".equalsIgnoreCase(module) || part <= 4) {
            return SkillType.LISTENING;
        }
        return SkillType.READING;
    }

    private String toParagraphHtml(String text) {
        return "<p>" + text.trim()
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replaceAll("\\R{2,}", "</p><p>")
                .replaceAll("\\R", "<br>")
                + "</p>";
    }

    private User currentUser(AppUserPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found");
        }
        return userRepository.findById(principal.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }
}
