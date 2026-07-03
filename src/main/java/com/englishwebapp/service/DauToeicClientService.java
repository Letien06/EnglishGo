package com.englishwebapp.service;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.dto.DauToeicDifficultyLevelResponse;
import com.englishwebapp.dto.DauToeicDifficultySessionResponse;
import com.englishwebapp.dto.DauToeicPartResponse;
import com.englishwebapp.dto.DauToeicPassageResponse;
import com.englishwebapp.dto.DauToeicPracticeItemResponse;
import com.englishwebapp.dto.DauToeicQuestionResponse;
import com.englishwebapp.dto.DauToeicSetResponse;
import com.englishwebapp.dto.DauToeicTestResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.HtmlUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriBuilder;
import org.springframework.web.util.UriUtils;

@Service
@RequiredArgsConstructor
public class DauToeicClientService {

    private static final int DEFAULT_PRACTICE_LIMIT = 30;

    private final AppProperties appProperties;

    /** Shared RestClient — built once at startup, reused across requests. */
    private RestClient restClient;

    @PostConstruct
    void initRestClient() {
        AppProperties.DauToeic config = appProperties.getDautoeic();
        if (StringUtils.hasText(config.getSupabaseUrl()) && StringUtils.hasText(config.getAnonKey())) {
            this.restClient = RestClient.builder()
                    .baseUrl(config.getSupabaseUrl())
                    .defaultHeader("apikey", config.getAnonKey())
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + config.getAnonKey())
                    .defaultHeader(HttpHeaders.ACCEPT, "application/json")
                    .build();
        }
    }

    @Cacheable(value = "dautoeic-sets")
    public List<DauToeicSetResponse> listSets() {
        JsonNode rows = get("/rest/v1/mock_test_sets", builder -> builder
                .queryParam("select", "id,name,description,order_index")
                .queryParam("is_hidden", "eq.false")
                .queryParam("order", "order_index.asc"));
        List<DauToeicSetResponse> sets = new ArrayList<>();
        for (JsonNode row : rows) {
            sets.add(new DauToeicSetResponse(
                    text(row, "id"),
                    text(row, "name"),
                    text(row, "description"),
                    integer(row, "order_index")));
        }
        return sets;
    }

    @Cacheable(value = "dautoeic-tests", key = "#setId ?: 'all'")
    public List<DauToeicTestResponse> listTests(String setId) {
        JsonNode rows = get("/rest/v1/mock_tests", builder -> {
            builder.queryParam("select", "*,mock_test_sets(name)")
                    .queryParam("is_hidden", "eq.false")
                    .queryParam("order", "order_index.asc");
            if (StringUtils.hasText(setId)) {
                builder.queryParam("set_id", "eq." + setId.trim());
            }
            return builder;
        });
        List<DauToeicTestResponse> tests = new ArrayList<>();
        for (JsonNode row : rows) {
            tests.add(test(row));
        }
        return tests;
    }

    @Cacheable(value = "dautoeic-test", key = "#testId")
    public DauToeicTestResponse getTest(String testId) {
        requireId(testId, "testId");
        JsonNode rows = get("/rest/v1/mock_tests", builder -> builder
                .queryParam("select", "*,mock_test_sets(name)")
                .queryParam("id", "eq." + testId.trim())
                .queryParam("limit", "1"));
        if (!rows.isArray() || rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dau TOEIC test not found");
        }
        return test(rows.get(0));
    }

    public DauToeicPartResponse getListeningPart(String testId, int part) {
        if (part < 1 || part > 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Listening part must be between 1 and 4");
        }
        return getPart(testId, part);
    }

    public DauToeicPartResponse getReadingPart(String testId, int part) {
        if (part < 5 || part > 7) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reading part must be between 5 and 7");
        }
        return getPart(testId, part);
    }

    public DauToeicPartResponse getPart(String testId, int part) {
        if (part < 1 || part > 7) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "TOEIC part must be between 1 and 7");
        }
        DauToeicTestResponse test = getTest(testId);
        List<DauToeicPassageResponse> passages = passages(test, part);
        List<DauToeicQuestionResponse> questions = questions(test, part);
        return new DauToeicPartResponse(test, part, part <= 4 ? "listening" : "reading", passages, questions);
    }

    @Cacheable(value = "dautoeic-difficulty-levels", key = "#part")
    public List<DauToeicDifficultyLevelResponse> listDifficultyLevels(int part) {
        requireListeningPart(part);
        return difficultyLevels(part, practiceStats(part));
    }

    @Cacheable(value = "dautoeic-reading-difficulty-levels", key = "#part")
    public List<DauToeicDifficultyLevelResponse> listReadingDifficultyLevels(int part) {
        requireReadingPart(part);
        return difficultyLevels(part, practiceStats(part));
    }

    private List<DauToeicDifficultyLevelResponse> difficultyLevels(int part, List<PracticeStat> stats) {
        Map<Integer, List<PracticeStat>> byLevel = new LinkedHashMap<>();
        for (int level = 1; level <= 5; level++) {
            byLevel.put(level, new ArrayList<>());
        }
        for (PracticeStat stat : stats) {
            if (stat.level() != null && byLevel.containsKey(stat.level())) {
                byLevel.get(stat.level()).add(stat);
            }
        }
        List<DauToeicDifficultyLevelResponse> levels = new ArrayList<>();
        for (Map.Entry<Integer, List<PracticeStat>> entry : byLevel.entrySet()) {
            int level = entry.getKey();
            List<PracticeStat> levelStats = entry.getValue();
            int total = levelStats.size();
            int totalAttempts = levelStats.stream()
                    .map(PracticeStat::totalAttempts)
                    .filter(Objects::nonNull)
                    .mapToInt(Integer::intValue)
                    .sum();
            int wrongAttempts = levelStats.stream()
                    .map(PracticeStat::wrongCount)
                    .filter(Objects::nonNull)
                    .mapToInt(Integer::intValue)
                    .sum();
            Double min = levelStats.stream()
                    .map(PracticeStat::errorRate)
                    .filter(Objects::nonNull)
                    .min(Comparator.naturalOrder())
                    .orElse(defaultErrorMin(level));
            Double max = levelStats.stream()
                    .map(PracticeStat::errorRate)
                    .filter(Objects::nonNull)
                    .max(Comparator.naturalOrder())
                    .orElse(defaultErrorMax(level));
            levels.add(new DauToeicDifficultyLevelResponse(
                    part,
                    level,
                    levelTitle(level),
                    min,
                    max,
                    total,
                    0,
                    0,
                    0,
                    total,
                    totalAttempts,
                    wrongAttempts));
        }
        return levels;
    }

    @Cacheable(value = "dautoeic-difficulty-session", key = "#part + '-' + #level + '-' + (#limit ?: 'all')")
    public DauToeicDifficultySessionResponse getDifficultySession(int part, int level, Integer limit) {
        requireListeningPart(part);
        return difficultySession(part, level, limit);
    }

    @Cacheable(value = "dautoeic-reading-difficulty-session", key = "#part + '-' + #level + '-' + (#limit ?: 'all')")
    public DauToeicDifficultySessionResponse getReadingDifficultySession(int part, int level, Integer limit) {
        requireReadingPart(part);
        return difficultySession(part, level, limit);
    }

    private DauToeicDifficultySessionResponse difficultySession(int part, int level, Integer limit) {
        if (level < 1 || level > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Difficulty level must be between 1 and 5");
        }
        int effectiveLimit = limit == null || limit < 1 ? Integer.MAX_VALUE : limit;
        List<PracticeStat> levelStats = practiceStats(part).stream()
                .filter(stat -> Integer.valueOf(level).equals(stat.level()))
                .limit(effectiveLimit)
                .toList();
        List<DauToeicPracticeItemResponse> items = part <= 2 || part == 5
                ? questionPracticeItems(levelStats, part, level)
                : passagePracticeItems(levelStats, part, level);
        return new DauToeicDifficultySessionResponse(part, level, levelTitle(level), levelStats.size(), items);
    }

    private List<DauToeicPracticeItemResponse> questionPracticeItems(List<PracticeStat> stats, int part, int level) {
        Map<String, PracticeStat> statsById = new LinkedHashMap<>();
        for (PracticeStat stat : stats) {
            statsById.put(stat.itemId(), stat);
        }
        List<DauToeicQuestionResponse> questions = questionsByIds(new ArrayList<>(statsById.keySet()));
        Map<String, DauToeicQuestionResponse> questionsById = new HashMap<>();
        for (DauToeicQuestionResponse question : questions) {
            questionsById.put(question.id(), question);
        }
        List<DauToeicPracticeItemResponse> items = new ArrayList<>();
        for (PracticeStat stat : stats) {
            DauToeicQuestionResponse question = questionsById.get(stat.itemId());
            if (question == null) {
                continue;
            }
            items.add(new DauToeicPracticeItemResponse(
                    question.id(),
                    stat.itemType(),
                    part,
                    level,
                    stat.errorRate(),
                    stat.totalAttempts(),
                    stat.wrongCount(),
                    question.audioUrl(),
                    question.imageUrl(),
                    plainText(firstText(question.passageText(), question.questionText())),
                    question.translationVi(),
                    question.vocabulary(),
                    List.of(question)));
        }
        return items;
    }

    private List<DauToeicPracticeItemResponse> passagePracticeItems(List<PracticeStat> stats, int part, int level) {
        Map<String, PracticeStat> statsById = new LinkedHashMap<>();
        for (PracticeStat stat : stats) {
            statsById.put(stat.itemId(), stat);
        }
        List<DauToeicPassageResponse> passages = passagesByIds(new ArrayList<>(statsById.keySet()));
        Map<String, DauToeicPassageResponse> passagesById = new HashMap<>();
        for (DauToeicPassageResponse passage : passages) {
            passagesById.put(passage.id(), passage);
        }
        Map<String, List<DauToeicQuestionResponse>> questionsByPassageId =
                questionsByPassageIds(new ArrayList<>(statsById.keySet()));
        List<DauToeicPracticeItemResponse> items = new ArrayList<>();
        for (PracticeStat stat : stats) {
            DauToeicPassageResponse passage = passagesById.get(stat.itemId());
            if (passage == null) {
                continue;
            }
            List<DauToeicQuestionResponse> questions = questionsByPassageId.getOrDefault(passage.id(), List.of());
            String passageText = plainText(combinedText(
                    passage.transcript(),
                    passage.passageText(),
                    passage.passageText2(),
                    passage.passageText3()));
            items.add(new DauToeicPracticeItemResponse(
                    passage.id(),
                    stat.itemType(),
                    part,
                    level,
                    stat.errorRate(),
                    stat.totalAttempts(),
                    stat.wrongCount(),
                    passage.audioUrl(),
                    passage.imageUrl(),
                    passageText,
                    plainText(firstQuestionText(questions, DauToeicQuestionResponse::translationVi)),
                    firstQuestionText(questions, DauToeicQuestionResponse::vocabulary),
                    questions));
        }
        return items;
    }

    private List<PracticeStat> practiceStats(int part) {
        var body = JsonNodeFactory.instance.objectNode().put("p_part", part);
        JsonNode rows = post("/rest/v1/rpc/get_practice_stats", body);
        List<PracticeStat> stats = new ArrayList<>();
        for (JsonNode row : rows) {
            stats.add(new PracticeStat(
                    text(row, "item_id"),
                    text(row, "item_type"),
                    integer(row, "part"),
                    integer(row, "difficulty_level"),
                    integer(row, "total_attempts"),
                    integer(row, "wrong_count"),
                    decimal(row, "error_rate")));
        }
        return stats;
    }

    private List<DauToeicQuestionResponse> questions(DauToeicTestResponse test, int part) {
        JsonNode rows = get("/rest/v1/mock_test_questions", builder -> builder
                .queryParam("select", "*")
                .queryParam("test_id", "eq." + test.id())
                .queryParam("part", "eq." + part)
                .queryParam("order", "question_number.asc"));
        List<DauToeicQuestionResponse> questions = new ArrayList<>();
        for (JsonNode row : rows) {
            questions.add(question(row, Map.of(test.id(), test)));
        }
        return questions;
    }

    private List<DauToeicQuestionResponse> questionsByIds(List<String> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        JsonNode rows = get("/rest/v1/mock_test_questions", builder -> builder
                .queryParam("select", "*")
                .queryParam("id", "in.(" + String.join(",", ids) + ")"));
        Map<String, DauToeicTestResponse> testsById = testsById(rows);
        List<DauToeicQuestionResponse> questions = new ArrayList<>();
        for (JsonNode row : rows) {
            questions.add(question(row, testsById));
        }
        return questions;
    }

    private Map<String, List<DauToeicQuestionResponse>> questionsByPassageIds(List<String> passageIds) {
        if (passageIds.isEmpty()) {
            return Map.of();
        }
        JsonNode rows = get("/rest/v1/mock_test_questions", builder -> builder
                .queryParam("select", "*")
                .queryParam("passage_id", "in.(" + String.join(",", passageIds) + ")")
                .queryParam("order", "question_number.asc"));
        Map<String, DauToeicTestResponse> testsById = testsById(rows);
        Map<String, List<DauToeicQuestionResponse>> questionsByPassageId = new LinkedHashMap<>();
        for (JsonNode row : rows) {
            DauToeicQuestionResponse question = question(row, testsById);
            questionsByPassageId.computeIfAbsent(question.passageId(), ignored -> new ArrayList<>()).add(question);
        }
        return questionsByPassageId;
    }

    private DauToeicQuestionResponse question(JsonNode row, Map<String, DauToeicTestResponse> testsById) {
        DauToeicTestResponse test = testsById.get(text(row, "test_id"));
        String mediaFolder = test == null ? null : test.mediaFolder();
        return new DauToeicQuestionResponse(
                text(row, "id"),
                text(row, "test_id"),
                text(row, "passage_id"),
                integer(row, "part"),
                text(row, "section"),
                integer(row, "question_number"),
                mediaUrl(mediaFolder, text(row, "audio_url")),
                mediaUrl(mediaFolder, text(row, "image_url")),
                text(row, "passage_text"),
                text(row, "question_text"),
                text(row, "option_a"),
                text(row, "option_b"),
                text(row, "option_c"),
                text(row, "option_d"),
                text(row, "correct_answer"),
                text(row, "explanation_vi"),
                text(row, "explanation_en"),
                integer(row, "difficulty_level"),
                integer(row, "order_index"),
                text(row, "dich_nghia"),
                text(row, "tu_vung"),
                text(row, "dich_nghia_dap_an"));
    }

    private List<DauToeicPassageResponse> passages(DauToeicTestResponse test, int part) {
        JsonNode rows = get("/rest/v1/mock_test_passages", builder -> builder
                .queryParam("select", "*")
                .queryParam("test_id", "eq." + test.id())
                .queryParam("part", "eq." + part)
                .queryParam("order", "order_index.asc"));
        List<DauToeicPassageResponse> passages = new ArrayList<>();
        for (JsonNode row : rows) {
            passages.add(passage(row, Map.of(test.id(), test)));
        }
        return passages;
    }

    private List<DauToeicPassageResponse> passagesByIds(List<String> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        JsonNode rows = get("/rest/v1/mock_test_passages", builder -> builder
                .queryParam("select", "*")
                .queryParam("id", "in.(" + String.join(",", ids) + ")"));
        Map<String, DauToeicTestResponse> testsById = testsById(rows);
        List<DauToeicPassageResponse> passages = new ArrayList<>();
        for (JsonNode row : rows) {
            passages.add(passage(row, testsById));
        }
        return passages;
    }

    private DauToeicPassageResponse passage(JsonNode row, Map<String, DauToeicTestResponse> testsById) {
        DauToeicTestResponse test = testsById.get(text(row, "test_id"));
        String mediaFolder = test == null ? null : test.mediaFolder();
        return new DauToeicPassageResponse(
                text(row, "id"),
                text(row, "test_id"),
                integer(row, "part"),
                text(row, "passage_type"),
                mediaUrl(mediaFolder, text(row, "audio_url")),
                mediaUrl(mediaFolder, text(row, "image_url")),
                text(row, "passage_text"),
                text(row, "passage_text_2"),
                text(row, "passage_text_3"),
                text(row, "transcript"),
                integer(row, "order_index"),
                text(row, "title"));
    }

    private Map<String, DauToeicTestResponse> testsById(JsonNode rows) {
        List<String> testIds = new ArrayList<>();
        for (JsonNode row : rows) {
            String testId = text(row, "test_id");
            if (StringUtils.hasText(testId) && !testIds.contains(testId)) {
                testIds.add(testId);
            }
        }
        if (testIds.isEmpty()) {
            return Map.of();
        }
        JsonNode tests = get("/rest/v1/mock_tests", builder -> builder
                .queryParam("select", "*,mock_test_sets(name)")
                .queryParam("id", "in.(" + String.join(",", testIds) + ")"));
        Map<String, DauToeicTestResponse> testsById = new HashMap<>();
        for (JsonNode row : tests) {
            DauToeicTestResponse test = test(row);
            testsById.put(test.id(), test);
        }
        return testsById;
    }

    private DauToeicTestResponse test(JsonNode row) {
        return new DauToeicTestResponse(
                text(row, "id"),
                text(row, "set_id"),
                text(row.path("mock_test_sets"), "name"),
                text(row, "name"),
                text(row, "description"),
                text(row, "source"),
                integer(row, "year"),
                integer(row, "difficulty_level"),
                integer(row, "total_questions"),
                integer(row, "listening_duration_seconds"),
                integer(row, "reading_duration_seconds"),
                bool(row, "is_free"),
                bool(row, "is_hidden"),
                integer(row, "order_index"),
                text(row, "media_folder"),
                integer(row, "media_version"));
    }

    private JsonNode get(String path, java.util.function.Function<UriBuilder, UriBuilder> uriCustomizer) {
        requireConfigured();
        try {
            JsonNode response = restClient.get()
                    .uri(builder -> uriCustomizer.apply(builder.path(path)).build())
                    .retrieve()
                    .body(JsonNode.class);
            return response == null ? com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode() : response;
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Dau TOEIC API error (" + exception.getStatusCode().value() + ")",
                    exception);
        } catch (RestClientException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot connect to Dau TOEIC API", exception);
        }
    }

    private JsonNode post(String path, JsonNode body) {
        requireConfigured();
        try {
            JsonNode response = restClient.post()
                    .uri(path)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            return response == null ? JsonNodeFactory.instance.arrayNode() : response;
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Dau TOEIC API error (" + exception.getStatusCode().value() + ")",
                    exception);
        } catch (RestClientException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot connect to Dau TOEIC API", exception);
        }
    }

    private String mediaUrl(String mediaFolder, String fileName) {
        if (!StringUtils.hasText(fileName)) {
            return null;
        }
        String cleanFileName = fileName.trim();
        if (cleanFileName.startsWith("http://") || cleanFileName.startsWith("https://")) {
            return cleanFileName;
        }
        if (!StringUtils.hasText(mediaFolder)) {
            return cleanFileName;
        }
        String path = stripSlashes(mediaFolder) + "/" + stripSlashes(cleanFileName);
        String encodedPath = encodePath(path);
        return stripTrailingSlash(appProperties.getDautoeic().getMediaBaseUrl()) + "/" + encodedPath;
    }

    private String encodePath(String value) {
        List<String> segments = new ArrayList<>();
        for (String segment : value.split("/")) {
            if (StringUtils.hasText(segment)) {
                segments.add(UriUtils.encodePathSegment(segment, StandardCharsets.UTF_8));
            }
        }
        return String.join("/", segments);
    }

    private String stripSlashes(String value) {
        return value.replaceAll("^/+", "").replaceAll("/+$", "");
    }

    private String stripTrailingSlash(String value) {
        return value == null ? "" : value.replaceAll("/+$", "");
    }

    private void requireConfigured() {
        if (restClient == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dau TOEIC API is not configured");
        }
    }

    private void requireId(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " is required");
        }
    }

    private void requireListeningPart(int part) {
        if (part < 1 || part > 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Listening part must be between 1 and 4");
        }
    }

    private void requireReadingPart(int part) {
        if (part < 5 || part > 7) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reading part must be between 5 and 7");
        }
    }

    private String levelTitle(int level) {
        return switch (level) {
            case 1 -> "Level 1 - De";
            case 2 -> "Level 2 - Co ban";
            case 3 -> "Level 3 - Trung binh";
            case 4 -> "Level 4 - Kho";
            case 5 -> "Level 5 - Rat kho";
            default -> "Level " + level;
        };
    }

    private Double defaultErrorMin(int level) {
        return switch (level) {
            case 1 -> 0.01;
            case 2 -> 0.14;
            case 3 -> 0.23;
            case 4 -> 0.32;
            case 5 -> 0.43;
            default -> 0.0;
        };
    }

    private Double defaultErrorMax(int level) {
        return switch (level) {
            case 1 -> 0.14;
            case 2 -> 0.23;
            case 3 -> 0.32;
            case 4 -> 0.43;
            case 5 -> 0.85;
            default -> 1.0;
        };
    }

    private String firstText(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private String firstQuestionText(
            List<DauToeicQuestionResponse> questions,
            java.util.function.Function<DauToeicQuestionResponse, String> extractor) {
        for (DauToeicQuestionResponse question : questions) {
            String value = extractor.apply(question);
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private String combinedText(String... values) {
        List<String> parts = new ArrayList<>();
        for (String value : values) {
            String cleaned = plainText(value);
            if (StringUtils.hasText(cleaned) && !parts.contains(cleaned)) {
                parts.add(cleaned);
            }
        }
        return parts.isEmpty() ? null : String.join("\n\n", parts);
    }

    private String plainText(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String withBreaks = value
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</p>", "\n")
                .replaceAll("(?i)</div>", "\n");
        String withoutTags = withBreaks.replaceAll("<[^>]+>", "");
        String decoded = HtmlUtils.htmlUnescape(withoutTags);
        return decoded.replaceAll("[ \\t\\x0B\\f\\r]+", " ")
                .replaceAll("\\n\\s+", "\n")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return StringUtils.hasText(text) ? text : null;
    }

    private Integer integer(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asInt() : null;
    }

    private Double decimal(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asDouble() : null;
    }

    private Boolean bool(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isBoolean() ? value.asBoolean() : null;
    }

    private record PracticeStat(
            String itemId,
            String itemType,
            Integer part,
            Integer level,
            Integer totalAttempts,
            Integer wrongCount,
            Double errorRate) {
    }
}
