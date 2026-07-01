package com.englishwebapp.service;

import com.englishwebapp.dto.AiVocabCandidate;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;

@Service
@RequiredArgsConstructor
public class DictionaryVocabularyService {

    private static final String DICTIONARY_BASE_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";

    private final GeminiVocabularyService geminiVocabularyService;

    public List<AiVocabCandidate> enrichWithDictionary(List<String> suggestedWords, int count) {
        int safeCount = Math.max(1, Math.min(count, 50));
        List<DictionaryEntry> dictionaryEntries = new ArrayList<>();
        for (String suggestedWord : uniqueWords(suggestedWords)) {
            if (dictionaryEntries.size() >= safeCount) {
                break;
            }
            lookup(suggestedWord).ifPresent(dictionaryEntries::add);
        }
        if (dictionaryEntries.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "AI suggested words, but none could be verified in the dictionary.");
        }

        Map<String, String> vietnameseMeanings = translateMeanings(dictionaryEntries);
        Map<String, String> generatedExamples = generateMissingExamples(dictionaryEntries);
        return dictionaryEntries.stream()
                .map(entry -> new AiVocabCandidate(
                        entry.word(),
                        vietnameseMeanings.getOrDefault(entry.word().toLowerCase(), entry.definition()),
                        entry.partOfSpeech(),
                        entry.phonetic(),
                        exampleFor(entry, generatedExamples),
                        entry.definition(),
                        "dictionaryapi.dev"))
                .toList();
    }

    private Optional<DictionaryEntry> lookup(String word) {
        if (!StringUtils.hasText(word) || !word.matches("[a-zA-Z][a-zA-Z\\-']{1,48}")) {
            return Optional.empty();
        }
        String encodedWord = UriUtils.encodePathSegment(word.trim().toLowerCase(), StandardCharsets.UTF_8);
        try {
            JsonNode response = RestClient.create()
                    .get()
                    .uri(DICTIONARY_BASE_URL + encodedWord)
                    .retrieve()
                    .body(JsonNode.class);
            return parseEntry(response);
        } catch (RestClientException exception) {
            return Optional.empty();
        }
    }

    private Optional<DictionaryEntry> parseEntry(JsonNode response) {
        if (response == null || !response.isArray() || response.isEmpty()) {
            return Optional.empty();
        }
        JsonNode entry = response.path(0);
        String word = entry.path("word").asText("");
        if (!StringUtils.hasText(word)) {
            return Optional.empty();
        }

        Optional<DefinitionPick> definitionPick = firstDefinition(entry.path("meanings"));
        if (definitionPick.isEmpty()) {
            return Optional.empty();
        }
        DefinitionPick pick = definitionPick.get();
        String partOfSpeech = normalizePartOfSpeech(pick.partOfSpeech());
        return Optional.of(new DictionaryEntry(
                word.trim().toLowerCase(),
                partOfSpeech,
                firstPhonetic(entry.path("phonetics")),
                cleanOptional(pick.example()),
                pick.definition()));
    }

    private Optional<DefinitionPick> firstDefinition(JsonNode meanings) {
        if (!meanings.isArray()) {
            return Optional.empty();
        }
        for (JsonNode meaning : meanings) {
            JsonNode definitions = meaning.path("definitions");
            if (!definitions.isArray()) {
                continue;
            }
            for (JsonNode definition : definitions) {
                String definitionText = definition.path("definition").asText("");
                if (StringUtils.hasText(definitionText)) {
                    return Optional.of(new DefinitionPick(
                            meaning.path("partOfSpeech").asText(""),
                            definitionText.trim(),
                            definition.path("example").asText("")));
                }
            }
        }
        return Optional.empty();
    }

    private String firstPhonetic(JsonNode phonetics) {
        if (!phonetics.isArray()) {
            return null;
        }
        for (JsonNode phonetic : phonetics) {
            String text = phonetic.path("text").asText("");
            if (StringUtils.hasText(text)) {
                return text.trim();
            }
        }
        return null;
    }

    private Map<String, String> translateMeanings(List<DictionaryEntry> dictionaryEntries) {
        try {
            return geminiVocabularyService.translateDictionaryDefinitions(dictionaryEntries.stream()
                    .map(entry -> new GeminiVocabularyService.DictionaryDefinitionForTranslation(
                            entry.word(),
                            entry.partOfSpeech(),
                            entry.definition()))
                    .toList());
        } catch (ResponseStatusException exception) {
            return Map.of();
        }
    }

    private Map<String, String> generateMissingExamples(List<DictionaryEntry> dictionaryEntries) {
        List<GeminiVocabularyService.DictionaryExampleRequest> missingExamples = dictionaryEntries.stream()
                .filter(entry -> !isUsableExample(entry.example(), entry.word()))
                .map(entry -> new GeminiVocabularyService.DictionaryExampleRequest(
                        entry.word(),
                        entry.partOfSpeech(),
                        entry.definition()))
                .toList();
        if (missingExamples.isEmpty()) {
            return Map.of();
        }
        try {
            return geminiVocabularyService.generateDictionaryExamples(missingExamples);
        } catch (ResponseStatusException exception) {
            return Map.of();
        }
    }

    private String exampleFor(DictionaryEntry entry, Map<String, String> generatedExamples) {
        String dictionaryExample = cleanExample(entry.example(), entry.word());
        if (dictionaryExample != null) {
            return dictionaryExample;
        }
        String generatedExample = cleanExample(generatedExamples.get(entry.word().toLowerCase()), entry.word());
        if (generatedExample != null) {
            return generatedExample;
        }
        return fallbackExample(entry.word(), entry.partOfSpeech());
    }

    private String cleanExample(String value, String word) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String example = value.trim().replaceAll("\\s+", " ");
        if (!isUsableExample(example, word)) {
            return null;
        }
        return example;
    }

    private boolean isUsableExample(String value, String word) {
        if (!StringUtils.hasText(value) || !StringUtils.hasText(word)) {
            return false;
        }
        String example = value.trim();
        if (example.length() < 12 || example.length() > 180) {
            return false;
        }
        String lower = example.toLowerCase();
        if (lower.startsWith("a ") || lower.startsWith("an ") || lower.startsWith("the act of ")
                || lower.startsWith("one who ") || lower.startsWith("important types ")) {
            return false;
        }
        if (!example.matches("(?is).*\\b" + java.util.regex.Pattern.quote(word.toLowerCase()) + "\\b.*")) {
            return false;
        }
        return example.endsWith(".") || example.endsWith("?") || example.endsWith("!");
    }

    private String fallbackExample(String word, String partOfSpeech) {
        if ("VERB".equals(partOfSpeech)) {
            return "We need to " + word + " the request before Friday.";
        }
        if ("ADJ".equals(partOfSpeech)) {
            return "The " + word + " option is available for customers.";
        }
        if ("ADV".equals(partOfSpeech)) {
            return "The team responded " + word + " to the customer.";
        }
        return "The " + word + " is important for this project.";
    }

    private List<String> uniqueWords(List<String> words) {
        if (words == null) {
            return List.of();
        }
        List<String> uniqueWords = new ArrayList<>();
        for (String word : words) {
            if (!StringUtils.hasText(word)) {
                continue;
            }
            String normalized = word.trim().toLowerCase();
            if (!uniqueWords.contains(normalized)) {
                uniqueWords.add(normalized);
            }
        }
        return uniqueWords;
    }

    private String normalizePartOfSpeech(String value) {
        return switch (value == null ? "" : value.toLowerCase()) {
            case "noun" -> "NOUN";
            case "verb" -> "VERB";
            case "adjective" -> "ADJ";
            case "adverb" -> "ADV";
            default -> "OTHER";
        };
    }

    private String cleanOptional(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private record DictionaryEntry(
            String word,
            String partOfSpeech,
            String phonetic,
            String example,
            String definition) {
    }

    private record DefinitionPick(
            String partOfSpeech,
            String definition,
            String example) {
    }
}
