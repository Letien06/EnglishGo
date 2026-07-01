package com.englishwebapp.service;

import com.englishwebapp.config.AppProperties;
import com.englishwebapp.dto.GeneratedVocabWord;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class GeminiVocabularyService {

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    public List<GeneratedVocabWord> generateFromTopic(String input, int count) {
        String prompt = basePrompt(count)
                + "\nMode: topic.\nTopic or notes:\n" + requireText(input);
        return generate(prompt, null);
    }

    public List<String> suggestWordsFromTopic(String input, int count) {
        return suggestWordsFromTopic(input, count, List.of());
    }

    public List<String> suggestWordsFromTopic(String input, int count, List<String> excludedWords) {
        String prompt = suggestionPrompt(count, excludedWords)
                + "\nMode: topic.\nTopic or notes:\n" + requireText(input);
        return suggestWords(prompt, null);
    }

    public List<GeneratedVocabWord> generateFromReading(String passage, int count) {
        String prompt = basePrompt(count)
                + "\nMode: reading passage extraction.\nExtract important English words and phrases from this passage:\n"
                + requireText(passage);
        return generate(prompt, null);
    }

    public List<String> suggestWordsFromReading(String passage, int count) {
        return suggestWordsFromReading(passage, count, List.of());
    }

    public List<String> suggestWordsFromReading(String passage, int count, List<String> excludedWords) {
        String prompt = suggestionPrompt(count, excludedWords)
                + "\nMode: reading passage extraction.\nExtract useful dictionary headwords from this passage:\n"
                + requireText(passage);
        return suggestWords(prompt, null);
    }

    public List<GeneratedVocabWord> generateFromImage(MultipartFile image, int count) {
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image is required");
        }
        String contentType = image.getContentType();
        if (!List.of("image/jpeg", "image/png", "image/webp").contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only JPG, PNG, or WEBP images are supported");
        }
        if (image.getSize() > 5 * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image must be 5MB or smaller");
        }
        try {
            String prompt = basePrompt(count)
                    + "\nMode: image OCR and vocabulary extraction.\n"
                    + "Read visible English text in the image, then extract useful vocabulary.";
            return generate(prompt, new ImagePart(contentType, Base64.getEncoder().encodeToString(image.getBytes())));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot read uploaded image", exception);
        }
    }

    public List<String> suggestWordsFromImage(MultipartFile image, int count) {
        return suggestWordsFromImage(image, count, List.of());
    }

    public List<String> suggestWordsFromImage(MultipartFile image, int count, List<String> excludedWords) {
        ImagePart imagePart = readImagePart(image);
        String prompt = suggestionPrompt(count, excludedWords)
                + "\nMode: image OCR and vocabulary extraction.\n"
                + "Read visible English text in the image, then suggest useful dictionary headwords.";
        return suggestWords(prompt, imagePart);
    }

    public Map<String, String> translateDictionaryDefinitions(List<DictionaryDefinitionForTranslation> definitions) {
        if (definitions.isEmpty()) {
            return Map.of();
        }
        List<Map<String, String>> entries = definitions.stream()
                .map(item -> Map.of(
                        "word", item.word(),
                        "partOfSpeech", cleanOptional(item.partOfSpeech()) == null ? "" : item.partOfSpeech(),
                        "definition", item.definition()))
                .toList();
        String prompt;
        try {
            prompt = """
                    Translate these English dictionary definitions into concise Vietnamese meanings for TOEIC learners.
                    Do not add new senses that are not present in the definition.
                    Return only a JSON array. No markdown.
                    Each item must have exactly these keys: word, meaning.
                    Entries:
                    %s
                    """.formatted(objectMapper.writeValueAsString(entries));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot prepare dictionary translation request", exception);
        }
        String text = generateText(prompt, null);
        String json = extractJsonArray(text);
        try {
            JsonNode array = objectMapper.readTree(json);
            Map<String, String> translations = new LinkedHashMap<>();
            for (JsonNode node : array) {
                String word = node.path("word").asText("");
                String meaning = node.path("meaning").asText("");
                if (StringUtils.hasText(word) && StringUtils.hasText(meaning)) {
                    translations.put(word.trim().toLowerCase(), meaning.trim());
                }
            }
            return translations;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot parse dictionary translation JSON", exception);
        }
    }

    public Map<String, String> generateDictionaryExamples(List<DictionaryExampleRequest> entries) {
        if (entries == null || entries.isEmpty()) {
            return Map.of();
        }
        List<Map<String, String>> requestEntries = entries.stream()
                .map(item -> Map.of(
                        "word", item.word(),
                        "partOfSpeech", cleanOptional(item.partOfSpeech()) == null ? "" : item.partOfSpeech(),
                        "definition", item.definition()))
                .toList();
        String prompt;
        try {
            prompt = """
                    Write one short natural English example sentence for each dictionary-verified word.
                    The sentence must include the exact word, be useful for TOEIC learners, and must not be a definition.
                    Return only a JSON array. No markdown.
                    Each item must have exactly these keys: word, example.
                    Entries:
                    %s
                    """.formatted(objectMapper.writeValueAsString(requestEntries));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot prepare dictionary example request", exception);
        }
        String text = generateText(prompt, null);
        String json = extractJsonArray(text);
        try {
            JsonNode array = objectMapper.readTree(json);
            Map<String, String> examples = new LinkedHashMap<>();
            for (JsonNode node : array) {
                String word = node.path("word").asText("");
                String example = node.path("example").asText("");
                if (StringUtils.hasText(word) && StringUtils.hasText(example)) {
                    examples.put(word.trim().toLowerCase(), example.trim());
                }
            }
            return examples;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot parse dictionary example JSON", exception);
        }
    }

    private List<String> suggestWords(String prompt, ImagePart imagePart) {
        String text = generateText(prompt, imagePart);
        String json = extractJsonArray(text);
        try {
            JsonNode array = objectMapper.readTree(json);
            if (!array.isArray()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gemini word suggestion is not a JSON array");
            }
            List<String> words = new ArrayList<>();
            for (JsonNode node : array) {
                String word = node.isTextual() ? node.asText("") : node.path("word").asText("");
                if (StringUtils.hasText(word)) {
                    String normalized = word.trim().toLowerCase();
                    if (!words.contains(normalized)) {
                        words.add(normalized);
                    }
                }
            }
            if (words.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gemini returned no candidate words");
            }
            return words;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot parse Gemini word suggestion JSON", exception);
        }
    }

    private List<GeneratedVocabWord> generate(String prompt, ImagePart imagePart) {
        return parseWords(generateResponse(prompt, imagePart));
    }

    private String generateText(String prompt, ImagePart imagePart) {
        JsonNode response = generateResponse(prompt, imagePart);
        String text = response.path("candidates")
                .path(0)
                .path("content")
                .path("parts")
                .path(0)
                .path("text")
                .asText("");
        if (!StringUtils.hasText(text)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gemini returned no text");
        }
        return text;
    }

    private JsonNode generateResponse(String prompt, ImagePart imagePart) {
        AppProperties.Gemini gemini = appProperties.getGemini();
        if (!StringUtils.hasText(gemini.getApiKey())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gemini API key is not configured");
        }

        List<Map<String, Object>> parts = new ArrayList<>();
        parts.add(Map.of("text", prompt));
        if (imagePart != null) {
            parts.add(Map.of("inline_data", Map.of(
                    "mime_type", imagePart.mimeType(),
                    "data", imagePart.base64Data())));
        }

        Map<String, Object> request = Map.of(
                "contents", List.of(Map.of("parts", parts)),
                "generationConfig", Map.of(
                        "temperature", 0.35,
                        "responseMimeType", "application/json"));

        String endpoint = gemini.getBaseUrl()
                + "/models/" + gemini.getModel()
                + ":generateContent?key=" + gemini.getApiKey();
        JsonNode response;
        try {
            response = RestClient.create()
                    .post()
                    .uri(endpoint)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    geminiErrorMessage(gemini.getModel(), exception),
                    exception);
        } catch (RestClientException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Cannot connect to Gemini API. Please check GEMINI_BASE_URL and network.",
                    exception);
        }
        return response;
    }

    private String geminiErrorMessage(String model, RestClientResponseException exception) {
        String providerMessage = geminiProviderMessage(exception.getResponseBodyAsString());
        if (exception.getStatusCode().value() == 404 && providerMessage.toLowerCase().contains("not found")) {
            return "Gemini model '" + model
                    + "' is not available for generateContent. Set GEMINI_MODEL to a supported model such as gemini-2.5-flash.";
        }
        return "Gemini API error (" + exception.getStatusCode().value() + "): " + providerMessage;
    }

    private String geminiProviderMessage(String responseBody) {
        if (!StringUtils.hasText(responseBody)) {
            return "No error details returned by provider.";
        }
        try {
            String message = objectMapper.readTree(responseBody)
                    .path("error")
                    .path("message")
                    .asText("");
            if (StringUtils.hasText(message)) {
                return message.trim();
            }
        } catch (IOException ignored) {
            // Fall through to a compact generic message instead of leaking raw provider JSON into the UI.
        }
        return "The provider rejected the request.";
    }

    private List<GeneratedVocabWord> parseWords(JsonNode response) {
        String text = response.path("candidates")
                .path(0)
                .path("content")
                .path("parts")
                .path(0)
                .path("text")
                .asText("");
        if (!StringUtils.hasText(text)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gemini returned no vocabulary");
        }
        String json = extractJsonArray(text);
        try {
            JsonNode array = objectMapper.readTree(json);
            if (!array.isArray()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gemini response is not a JSON array");
            }
            List<GeneratedVocabWord> words = new ArrayList<>();
            for (JsonNode node : array) {
                String word = node.path("word").asText("");
                String meaning = node.path("meaning").asText("");
                if (!StringUtils.hasText(word) || !StringUtils.hasText(meaning)) {
                    continue;
                }
                words.add(new GeneratedVocabWord(
                        word.trim(),
                        meaning.trim(),
                        cleanOptional(node.path("partOfSpeech").asText("")),
                        cleanOptional(node.path("phonetic").asText("")),
                        cleanOptional(node.path("example").asText(""))));
            }
            if (words.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gemini returned no valid vocabulary words");
            }
            return words;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Cannot parse Gemini vocabulary JSON", exception);
        }
    }

    private String extractJsonArray(String text) {
        int start = text.indexOf('[');
        int end = text.lastIndexOf(']');
        if (start < 0 || end <= start) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Gemini response does not contain a JSON array");
        }
        return text.substring(start, end + 1);
    }

    private String basePrompt(int count) {
        int safeCount = Math.max(1, Math.min(count, 50));
        return """
                You are an English vocabulary assistant for Vietnamese TOEIC learners.
                Generate at most %d useful English vocabulary entries.
                Do not copy copyrighted test content.
                Return only a JSON array. No markdown.
                Each item must have exactly these keys:
                word, meaning, partOfSpeech, phonetic, example.
                meaning must be Vietnamese.
                partOfSpeech must be one of: NOUN, VERB, ADJ, ADV, PHRASE, OTHER.
                example must be a short natural English sentence.
                """.formatted(safeCount);
    }

    private String suggestionPrompt(int count) {
        return suggestionPrompt(count, List.of());
    }

    private String suggestionPrompt(int count, List<String> excludedWords) {
        int safeCount = Math.max(1, Math.min(count, 50));
        List<String> exclusions = cleanWordList(excludedWords).stream().limit(300).toList();
        String exclusionInstruction = exclusions.isEmpty()
                ? ""
                : "\nAlready in this vocabulary set. Do not return any of these words:\n"
                        + String.join(", ", exclusions) + "\n";
        return """
                You are an English vocabulary assistant for Vietnamese TOEIC learners.
                Suggest at most %d useful English vocabulary headwords.
                Return only a JSON array of lowercase English words. No markdown.
                Use single dictionary headwords when possible, not invented phrases.
                Do not include proper nouns, copyrighted test content, Vietnamese words, or explanations.
                %s
                """.formatted(safeCount, exclusionInstruction);
    }

    private List<String> cleanWordList(List<String> words) {
        if (words == null) {
            return List.of();
        }
        List<String> cleanWords = new ArrayList<>();
        for (String word : words) {
            if (!StringUtils.hasText(word)) {
                continue;
            }
            String normalized = word.trim().toLowerCase();
            if (!cleanWords.contains(normalized)) {
                cleanWords.add(normalized);
            }
        }
        return cleanWords;
    }

    private String requireText(String value) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Input text is required");
        }
        return value.trim();
    }

    private String cleanOptional(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private ImagePart readImagePart(MultipartFile image) {
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image is required");
        }
        String contentType = image.getContentType();
        if (!List.of("image/jpeg", "image/png", "image/webp").contains(contentType)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only JPG, PNG, or WEBP images are supported");
        }
        if (image.getSize() > 5 * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image must be 5MB or smaller");
        }
        try {
            return new ImagePart(contentType, Base64.getEncoder().encodeToString(image.getBytes()));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot read uploaded image", exception);
        }
    }

    private record ImagePart(String mimeType, String base64Data) {
    }

    public record DictionaryDefinitionForTranslation(
            String word,
            String partOfSpeech,
            String definition) {
    }

    public record DictionaryExampleRequest(
            String word,
            String partOfSpeech,
            String definition) {
    }
}
