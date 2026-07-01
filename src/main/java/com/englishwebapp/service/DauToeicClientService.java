package com.englishwebapp.service;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.dto.DauToeicPartResponse;
import com.englishwebapp.dto.DauToeicPassageResponse;
import com.englishwebapp.dto.DauToeicQuestionResponse;
import com.englishwebapp.dto.DauToeicSetResponse;
import com.englishwebapp.dto.DauToeicTestResponse;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriBuilder;
import org.springframework.web.util.UriUtils;

@Service
@RequiredArgsConstructor
public class DauToeicClientService {

    private final AppProperties appProperties;

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

    private List<DauToeicQuestionResponse> questions(DauToeicTestResponse test, int part) {
        JsonNode rows = get("/rest/v1/mock_test_questions", builder -> builder
                .queryParam("select", "*")
                .queryParam("test_id", "eq." + test.id())
                .queryParam("part", "eq." + part)
                .queryParam("order", "question_number.asc"));
        List<DauToeicQuestionResponse> questions = new ArrayList<>();
        for (JsonNode row : rows) {
            questions.add(new DauToeicQuestionResponse(
                    text(row, "id"),
                    text(row, "test_id"),
                    text(row, "passage_id"),
                    integer(row, "part"),
                    text(row, "section"),
                    integer(row, "question_number"),
                    mediaUrl(test.mediaFolder(), text(row, "audio_url")),
                    mediaUrl(test.mediaFolder(), text(row, "image_url")),
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
                    text(row, "dich_nghia_dap_an")));
        }
        return questions;
    }

    private List<DauToeicPassageResponse> passages(DauToeicTestResponse test, int part) {
        JsonNode rows = get("/rest/v1/mock_test_passages", builder -> builder
                .queryParam("select", "*")
                .queryParam("test_id", "eq." + test.id())
                .queryParam("part", "eq." + part)
                .queryParam("order", "order_index.asc"));
        List<DauToeicPassageResponse> passages = new ArrayList<>();
        for (JsonNode row : rows) {
            passages.add(new DauToeicPassageResponse(
                    text(row, "id"),
                    text(row, "test_id"),
                    integer(row, "part"),
                    text(row, "passage_type"),
                    mediaUrl(test.mediaFolder(), text(row, "audio_url")),
                    mediaUrl(test.mediaFolder(), text(row, "image_url")),
                    text(row, "passage_text"),
                    text(row, "passage_text_2"),
                    text(row, "passage_text_3"),
                    text(row, "transcript"),
                    integer(row, "order_index"),
                    text(row, "title")));
        }
        return passages;
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
        AppProperties.DauToeic config = appProperties.getDautoeic();
        if (!StringUtils.hasText(config.getSupabaseUrl()) || !StringUtils.hasText(config.getAnonKey())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dau TOEIC API is not configured");
        }
        try {
            JsonNode response = RestClient.builder()
                    .baseUrl(config.getSupabaseUrl())
                    .defaultHeader("apikey", config.getAnonKey())
                    .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + config.getAnonKey())
                    .defaultHeader(HttpHeaders.ACCEPT, "application/json")
                    .build()
                    .get()
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

    private void requireId(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " is required");
        }
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

    private Boolean bool(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isBoolean() ? value.asBoolean() : null;
    }
}
