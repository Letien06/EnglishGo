package com.englishwebapp.service;

import com.englishwebapp.dto.AiVocabCandidate;
import com.englishwebapp.dto.CommunityVocabFolderCard;
import com.englishwebapp.dto.CommunityVocabSetCard;
import com.englishwebapp.dto.MyVocabFolderCard;
import com.englishwebapp.dto.MyVocabSetCard;
import com.englishwebapp.dto.VocabProgressSetCard;
import com.englishwebapp.dto.VocabReviewResponse;
import com.englishwebapp.dto.VocabSetCard;
import com.englishwebapp.dto.VocabSetDetail;
import com.englishwebapp.dto.VocabSetSession;
import com.englishwebapp.dto.VocabWordCard;
import com.englishwebapp.dto.VocabWordRow;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserRole;
import com.englishwebapp.entity.VocabFolder;
import com.englishwebapp.entity.VocabProgressStatus;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.entity.VocabWord;
import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.SetOptions;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class VocabService {

    private static final BigDecimal MIN_EASE_FACTOR = BigDecimal.valueOf(1.30);
    private static final int DAILY_NEW_WORD_GOAL = 20;
    private static final String SETS = "vocabSets";
    private static final String WORDS = "vocabWords";
    private static final String FOLDERS = "vocabFolders";
    private static final String PROGRESS = "userVocabProgress";
    private static final String COUNTERS = "counters";

    private final ObjectProvider<Firestore> firestoreProvider;
    private final GeminiVocabularyService geminiVocabularyService;
    private final DictionaryVocabularyService dictionaryVocabularyService;
    private final AtomicBoolean seedChecked = new AtomicBoolean(false);

    public Page<VocabSet> findSets(String topic, Pageable pageable) {
        List<VocabSet> sets = publishedSets().stream()
                .filter(set -> set.getCreatedBy() == null)
                .filter(set -> !StringUtils.hasText(topic)
                        || containsIgnoreCase(set.getTopic(), topic)
                        || containsIgnoreCase(set.getTitle(), topic))
                .sorted(Comparator.comparing(VocabSet::getId))
                .toList();
        return page(sets, pageable);
    }

    public Page<VocabSetCard> findSetCards(String topic, Pageable pageable) {
        return findSets(topic, pageable).map(this::toSetCard);
    }

    public List<VocabSetCard> findPracticeSetOptions(Long userId) {
        Map<Long, VocabSetCard> options = new LinkedHashMap<>();
        if (userId != null) {
            publishedSets().stream()
                    .filter(set -> isOwner(set, userId))
                    .sorted(updatedDesc())
                    .map(this::toSetCard)
                    .forEach(card -> options.putIfAbsent(card.id(), card));
        }
        publishedSets().stream()
                .filter(set -> set.getCreatedBy() == null)
                .sorted(Comparator.comparing(VocabSet::getId))
                .limit(200)
                .map(this::toSetCard)
                .forEach(card -> options.putIfAbsent(card.id(), card));
        return List.copyOf(options.values());
    }

    public List<MyVocabSetCard> findMySetCards(Long userId) {
        return findMySetCards(userId, null);
    }

    public List<MyVocabSetCard> findMySetCards(Long userId, Long folderId) {
        if (userId == null) {
            return List.of();
        }
        if (folderId != null) {
            requireOwnedFolder(userId, folderId);
        }
        return publishedSets().stream()
                .filter(set -> isOwner(set, userId))
                .filter(set -> folderId == null || folderId.equals(folderId(set)))
                .sorted(updatedDesc())
                .map(set -> toMySetCard(userId, set))
                .toList();
    }

    public List<MyVocabFolderCard> findMyFolderCards(Long userId) {
        return findMyFolderCards(userId, null);
    }

    public List<MyVocabFolderCard> findMyFolderCards(Long userId, String search) {
        if (userId == null) {
            return List.of();
        }
        return liveFolders().stream()
                .filter(folder -> userId.equals(folder.getUser().getId()))
                .filter(folder -> !StringUtils.hasText(search) || containsIgnoreCase(folder.getName(), search))
                .sorted(folderUpdatedDesc())
                .map(folder -> {
                    long setCount = publishedSets().stream()
                            .filter(set -> isOwner(set, userId) && folder.getId().equals(folderId(set)))
                            .count();
                    long wordCount = publishedSets().stream()
                            .filter(set -> isOwner(set, userId) && folder.getId().equals(folderId(set)))
                            .mapToLong(set -> wordsForSet(set.getId()).size())
                            .sum();
                    return new MyVocabFolderCard(folder.getId(), folder.getName(), setCount, wordCount, folder.isPublicShared());
                })
                .toList();
    }

    public List<CommunityVocabFolderCard> findCommunityFolderCards(String search) {
        return liveFolders().stream()
                .filter(VocabFolder::isPublicShared)
                .filter(folder -> !StringUtils.hasText(search) || containsIgnoreCase(folder.getName(), search))
                .sorted(Comparator.comparing(VocabFolder::getSharedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toCommunityFolderCard)
                .toList();
    }

    public CommunityVocabFolderCard getCommunityFolderCard(Long folderId) {
        return toCommunityFolderCard(requirePublicFolder(folderId));
    }

    public List<CommunityVocabSetCard> findCommunitySetCards(Long folderId) {
        requirePublicFolder(folderId);
        return publishedSets().stream()
                .filter(set -> folderId.equals(folderId(set)))
                .sorted(updatedDesc())
                .map(set -> new CommunityVocabSetCard(
                        set.getId(),
                        set.getTitle(),
                        StringUtils.hasText(set.getDescription()) ? set.getDescription() : "No description",
                        StringUtils.hasText(set.getIcon()) ? set.getIcon() : "*",
                        wordsForSet(set.getId()).size()))
                .toList();
    }

    public long totalWords() {
        return totalWords(null);
    }

    public long totalWords(Long userId) {
        Map<Long, VocabSet> setsById = publishedSets().stream()
                .collect(Collectors.toMap(VocabSet::getId, set -> set));
        return publishedWords().stream()
                .filter(word -> isSetAccessible(setsById.get(folderlessSetId(word)), userId))
                .count();
    }

    public long learnedWords(Long userId) {
        return userId == null ? 0 : progressForUser(userId).size();
    }

    public long masteredWords(Long userId) {
        return userId == null ? 0 : progressForUser(userId).stream()
                .filter(progress -> progress.status() == VocabProgressStatus.MASTERED)
                .count();
    }

    public long dueWords(Long userId) {
        Instant now = Instant.now();
        return userId == null ? 0 : progressForUser(userId).stream()
                .filter(progress -> progress.nextReviewAt() != null && !progress.nextReviewAt().isAfter(now))
                .count();
    }

    public int dailyNewWordGoal() {
        return DAILY_NEW_WORD_GOAL;
    }

    public long studiedWordsToday(Long userId) {
        if (userId == null) {
            return 0;
        }
        Instant startOfDay = LocalDate.now(ZoneId.systemDefault())
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant();
        return progressForUser(userId).stream()
                .filter(progress -> progress.lastReviewedAt() != null && !progress.lastReviewedAt().isBefore(startOfDay))
                .count();
    }

    public List<VocabProgressSetCard> findProgressSetCards(Long userId) {
        if (userId == null) {
            return List.of();
        }
        Map<Long, VocabSet> setsById = new LinkedHashMap<>();
        publishedSets().stream()
                .filter(set -> isOwner(set, userId))
                .sorted(updatedDesc())
                .forEach(set -> setsById.putIfAbsent(set.getId(), set));
        publishedSets().stream()
                .filter(set -> set.getCreatedBy() == null)
                .sorted(Comparator.comparing(VocabSet::getId))
                .limit(100)
                .forEach(set -> setsById.putIfAbsent(set.getId(), set));
        return setsById.values().stream()
                .map(set -> toProgressSetCard(userId, set))
                .sorted((left, right) -> {
                    int dueCompare = Long.compare(right.dueWords(), left.dueWords());
                    if (dueCompare != 0) {
                        return dueCompare;
                    }
                    int progressCompare = Long.compare(right.learnedWords(), left.learnedWords());
                    if (progressCompare != 0) {
                        return progressCompare;
                    }
                    return Long.compare(right.totalWords(), left.totalWords());
                })
                .toList();
    }

    public VocabSetSession getSession(Long setId) {
        VocabSet set = requirePublishedSet(setId);
        return new VocabSetSession(set, wordCards(wordsForSet(setId)));
    }

    public VocabSetSession getFilteredSession(Long setId, Long userId, String mastery, String order, String amount) {
        VocabSet set = requirePublishedSet(setId);
        assertSetAccessible(set, userId);
        Map<Long, ProgressDoc> progressByWordId = progressForSet(userId, setId).stream()
                .collect(Collectors.toMap(ProgressDoc::wordId, progress -> progress));
        String safeMastery = normalizeMastery(mastery);
        Instant now = Instant.now();
        List<VocabWordCard> cards = wordsForSet(setId).stream()
                .filter(word -> matchesMastery(word, progressByWordId, safeMastery, now))
                .map(this::toWordCard)
                .collect(Collectors.toCollection(ArrayList::new));
        if ("random".equals(order)) {
            Collections.shuffle(cards);
        }
        int limit = parseAmount(amount, cards.size());
        return new VocabSetSession(set, cards.stream().limit(limit).toList());
    }

    public VocabSet createMySet(Long userId, String title, String description, String icon) {
        requireUserId(userId);
        long id = nextId(SETS);
        Instant now = Instant.now();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("createdById", userId);
        data.put("title", StringUtils.hasText(title) ? title.trim() : "My vocabulary set");
        data.put("topic", "My vocabulary set");
        data.put("description", cleanOptional(description));
        data.put("icon", normalizeIcon(icon));
        data.put("level", "Personal vocabulary");
        data.put("status", ContentStatus.PUBLISHED.name());
        data.put("sourceType", SourceType.MANUAL.name());
        data.put("publishedAtMillis", now.toEpochMilli());
        data.put("updatedAtMillis", now.toEpochMilli());
        setDoc(SETS, id, data);
        return requirePublishedSet(id);
    }

    public VocabFolder createMyFolder(Long userId, String name) {
        requireUserId(userId);
        if (!StringUtils.hasText(name)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Folder name is required");
        }
        long id = nextId(FOLDERS);
        Instant now = Instant.now();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("userId", userId);
        data.put("ownerName", userLabel(userId));
        data.put("name", name.trim());
        data.put("publicShared", false);
        data.put("createdAtMillis", now.toEpochMilli());
        data.put("updatedAtMillis", now.toEpochMilli());
        setDoc(FOLDERS, id, data);
        return requireOwnedFolder(userId, id);
    }

    public void assignMySetToFolder(Long userId, Long setId, Long folderId) {
        requireUserId(userId);
        VocabSet set = requireOwnedSet(userId, setId);
        VocabFolder folder = folderId == null ? null : requireOwnedFolder(userId, folderId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("folderId", folder == null ? null : folder.getId());
        data.put("folderName", folder == null ? null : folder.getName());
        data.put("folderPublicShared", folder != null && folder.isPublicShared());
        data.put("updatedAtMillis", Instant.now().toEpochMilli());
        setDoc(SETS, set.getId(), data);
        if (folder != null) {
            touchFolder(folder.getId());
        }
    }

    public void shareMyFolder(Long userId, Long folderId) {
        VocabFolder folder = requireOwnedFolder(userId, folderId);
        Instant now = Instant.now();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("publicShared", true);
        data.put("sharedAtMillis", now.toEpochMilli());
        data.put("updatedAtMillis", now.toEpochMilli());
        setDoc(FOLDERS, folder.getId(), data);
        publishedSets().stream()
                .filter(set -> folder.getId().equals(folderId(set)))
                .forEach(set -> setDoc(SETS, set.getId(), Map.of("folderPublicShared", true)));
    }

    public void renameMyFolder(Long userId, Long folderId, String name) {
        VocabFolder folder = requireOwnedFolder(userId, folderId);
        if (!StringUtils.hasText(name)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Folder name is required");
        }
        String cleanName = name.trim();
        setDoc(FOLDERS, folder.getId(), Map.of("name", cleanName, "updatedAtMillis", Instant.now().toEpochMilli()));
        publishedSets().stream()
                .filter(set -> folder.getId().equals(folderId(set)))
                .forEach(set -> setDoc(SETS, set.getId(), Map.of("folderName", cleanName)));
    }

    public void deleteMyFolder(Long userId, Long folderId) {
        VocabFolder folder = requireOwnedFolder(userId, folderId);
        setDoc(FOLDERS, folder.getId(), Map.of("deletedAtMillis", Instant.now().toEpochMilli()));
        publishedSets().stream()
                .filter(set -> folder.getId().equals(folderId(set)))
                .forEach(set -> {
                    Map<String, Object> data = new LinkedHashMap<>();
                    data.put("folderId", null);
                    data.put("folderName", null);
                    data.put("folderPublicShared", false);
                    data.put("updatedAtMillis", Instant.now().toEpochMilli());
                    setDoc(SETS, set.getId(), data);
                });
    }

    public VocabFolder copyCommunityFolder(Long userId, Long folderId) {
        requireUserId(userId);
        VocabFolder sourceFolder = requirePublicFolder(folderId);
        VocabFolder targetFolder = createMyFolder(userId, uniqueFolderName(userId, sourceFolder.getName()));
        publishedSets().stream()
                .filter(set -> folderId.equals(folderId(set)))
                .forEach(sourceSet -> copySetAsNew(userId, sourceSet, targetFolder));
        return targetFolder;
    }

    public int copyCommunitySet(Long userId, Long sourceSetId, Long targetSetId) {
        requireUserId(userId);
        VocabSet sourceSet = requirePublishedSet(sourceSetId);
        if (!isSetPublicShared(sourceSet)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found");
        }
        VocabSet targetSet = targetSetId == null
                ? copySetShell(userId, sourceSet, null)
                : requireOwnedSet(userId, targetSetId);
        return copyWords(sourceSet, targetSet);
    }

    public void renameMySet(Long userId, Long setId, String title) {
        VocabSet set = requireOwnedSet(userId, setId);
        if (!StringUtils.hasText(title)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Set title is required");
        }
        setDoc(SETS, set.getId(), Map.of("title", title.trim(), "updatedAtMillis", Instant.now().toEpochMilli()));
    }

    public void deleteMySet(Long userId, Long setId) {
        VocabSet set = requireOwnedSet(userId, setId);
        setDoc(SETS, set.getId(), Map.of("deletedAtMillis", Instant.now().toEpochMilli()));
    }

    public int addManualWords(Long userId, Long setId, String rowsText) {
        requireOwnedSet(userId, setId);
        List<AiVocabCandidate> candidates = parseDelimitedWords(rowsText);
        return saveCandidates(setId, candidates, SourceType.MANUAL, "Added manually by the learner.", 300);
    }

    public int importWords(Long userId, Long setId, MultipartFile file) {
        requireOwnedSet(userId, setId);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Import file is required");
        }
        String filename = Optional.ofNullable(file.getOriginalFilename()).orElse("").toLowerCase(Locale.ROOT);
        SourceType sourceType;
        List<AiVocabCandidate> candidates;
        if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
            sourceType = SourceType.EXCEL_IMPORT;
            candidates = parseExcelWords(file);
        } else if (filename.endsWith(".pdf")) {
            sourceType = SourceType.PDF_IMPORT;
            candidates = parseDelimitedWords(extractPdfText(file));
        } else {
            sourceType = SourceType.CSV_IMPORT;
            candidates = parseDelimitedWords(readTextFile(file));
        }
        return saveCandidates(setId, candidates, sourceType, "Imported from " + (StringUtils.hasText(filename) ? filename : "uploaded file") + ".", 500);
    }

    public VocabSetDetail getSetDetail(Long setId, Long userId) {
        VocabSet set = requirePublishedSet(setId);
        assertSetAccessible(set, userId);
        List<VocabWord> words = wordsForSet(setId);
        Map<Long, ProgressDoc> progressByWordId = progressForSet(userId, setId).stream()
                .collect(Collectors.toMap(ProgressDoc::wordId, progress -> progress));
        long mastered = progressByWordId.values().stream()
                .filter(progress -> progress.status() == VocabProgressStatus.MASTERED)
                .count();
        long learned = progressByWordId.size();
        int progressPercent = words.isEmpty() ? 0 : (int) Math.round((mastered * 100.0) / words.size());
        return new VocabSetDetail(
                set,
                words.size(),
                mastered,
                Math.max(0, learned - mastered),
                progressPercent,
                words.stream()
                        .map(word -> {
                            ProgressDoc progress = progressByWordId.get(word.getId());
                            return new VocabWordRow(
                                    word.getId(),
                                    word.getWord(),
                                    word.getMeaning(),
                                    word.getPartOfSpeech(),
                                    word.getPhonetic(),
                                    exampleForWord(word),
                                    word.getAudioUrl(),
                                    progress != null && progress.status() == VocabProgressStatus.MASTERED);
                        })
                        .toList());
    }

    public int generateWordsWithAi(Long setId, Long userId, String mode, String input, int count, MultipartFile image) {
        return saveAiWords(setId, previewAiWords(setId, mode, input, count, image));
    }

    public List<AiVocabCandidate> previewAiWords(Long setId, String mode, String input, int count, MultipartFile image) {
        requirePublishedSet(setId);
        int safeCount = Math.max(1, Math.min(count, 50));
        List<String> existingWords = wordsForSet(setId).stream()
                .map(word -> word.getWord().trim().toLowerCase(Locale.ROOT))
                .toList();
        List<String> suggestedWords = switch (mode) {
            case "reading" -> geminiVocabularyService.suggestWordsFromReading(input, safeCount, existingWords);
            case "image" -> geminiVocabularyService.suggestWordsFromImage(image, safeCount, existingWords);
            default -> geminiVocabularyService.suggestWordsFromTopic(input, safeCount, existingWords);
        };
        List<String> newSuggestedWords = excludeExistingWords(suggestedWords, existingWords, safeCount);
        if (newSuggestedWords.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "AI only suggested words that already exist in this set.");
        }
        return dictionaryVocabularyService.enrichWithDictionary(newSuggestedWords, safeCount);
    }

    public int saveAiWords(Long setId, List<AiVocabCandidate> candidates) {
        requirePublishedSet(setId);
        return saveCandidates(setId, candidates, SourceType.AI_GENERATED, null, 50);
    }

    private int saveCandidates(Long setId, List<AiVocabCandidate> candidates, SourceType sourceType, String sourceNote, int limit) {
        requirePublishedSet(setId);
        if (candidates == null || candidates.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No vocabulary words selected");
        }
        int created = 0;
        for (AiVocabCandidate candidate : candidates.stream().limit(Math.max(1, limit)).toList()) {
            if (!StringUtils.hasText(candidate.word()) || !StringUtils.hasText(candidate.meaning())) {
                continue;
            }
            String normalizedWord = candidate.word().trim().toLowerCase(Locale.ROOT);
            if (wordExists(setId, normalizedWord)) {
                continue;
            }
            long id = nextId(WORDS);
            Instant now = Instant.now();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("setId", setId);
            data.put("word", normalizedWord);
            data.put("meaning", candidate.meaning().trim());
            data.put("partOfSpeech", cleanOptional(candidate.partOfSpeech()));
            data.put("phonetic", cleanOptional(candidate.phonetic()));
            data.put("example", exampleOrFallback(candidate));
            data.put("status", ContentStatus.PUBLISHED.name());
            data.put("sourceType", sourceType.name());
            if (sourceType == SourceType.AI_GENERATED) {
                String source = cleanOptional(candidate.dictionarySource()) == null ? "dictionary" : candidate.dictionarySource().trim();
                String definition = cleanOptional(candidate.dictionaryDefinition()) == null ? "" : " Definition: " + candidate.dictionaryDefinition().trim();
                data.put("sourceNote", "AI suggested the word; dictionary data verified by " + source + "." + definition);
                data.put("licenseNote", "AI-assisted vocabulary candidate verified with dictionary data for free learning use.");
            } else {
                data.put("sourceNote", sourceNote);
                data.put("licenseNote", "Learner-provided vocabulary for personal study.");
            }
            data.put("publishedAtMillis", now.toEpochMilli());
            data.put("updatedAtMillis", now.toEpochMilli());
            setDoc(WORDS, id, data);
            created++;
        }
        if (created == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No new vocabulary words were saved");
        }
        setDoc(SETS, setId, Map.of("updatedAtMillis", Instant.now().toEpochMilli()));
        return created;
    }

    public VocabSetSession getReviewSession(Long userId, int size) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        VocabSet virtualSet = new VocabSet();
        virtualSet.setId(0L);
        virtualSet.setTitle("Due vocabulary review");
        virtualSet.setTopic("SM-2 Review");
        virtualSet.setLevel("Personal");
        Instant now = Instant.now();
        List<VocabWordCard> cards = progressForUser(userId).stream()
                .filter(progress -> progress.nextReviewAt() != null && !progress.nextReviewAt().isAfter(now))
                .sorted(Comparator.comparing(ProgressDoc::nextReviewAt))
                .limit(Math.max(1, Math.min(size, 100)))
                .map(progress -> findWord(progress.wordId()))
                .flatMap(Optional::stream)
                .map(this::toWordCard)
                .toList();
        return new VocabSetSession(virtualSet, cards);
    }

    public VocabReviewResponse review(Long userId, Long wordId, int quality) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        VocabWord word = findWord(wordId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary word not found"));
        ProgressDoc progress = findProgress(userId, wordId)
                .orElseGet(() -> new ProgressDoc(userId, wordId, folderlessSetId(word), VocabProgressStatus.NEW,
                        0, BigDecimal.valueOf(2.50), 0, null, null));
        progress = applySm2(progress, quality);
        saveProgress(progress);
        return new VocabReviewResponse(
                progress.status(),
                progress.interval(),
                progress.repetitions(),
                progress.easeFactor().doubleValue(),
                progress.nextReviewAt());
    }

    private ProgressDoc applySm2(ProgressDoc progress, int quality) {
        BigDecimal easeFactor = progress.easeFactor();
        int repetitions = progress.repetitions();
        int interval = progress.interval();
        VocabProgressStatus status;
        Instant now = Instant.now();

        if (quality < 3) {
            repetitions = 0;
            interval = 1;
            status = VocabProgressStatus.LEARNING;
        } else if (quality >= 5) {
            repetitions = Math.max(1, repetitions + 1);
            interval = 3;
            status = VocabProgressStatus.MASTERED;
        } else {
            repetitions++;
            if (repetitions == 1) {
                interval = 1;
            } else if (repetitions == 2) {
                interval = 6;
            } else {
                interval = BigDecimal.valueOf(interval)
                        .multiply(easeFactor)
                        .setScale(0, RoundingMode.HALF_UP)
                        .intValue();
            }

            BigDecimal qualityFactor = BigDecimal.valueOf(5 - quality);
            easeFactor = easeFactor.add(BigDecimal.valueOf(0.1)
                    .subtract(qualityFactor.multiply(BigDecimal.valueOf(0.08)
                            .add(qualityFactor.multiply(BigDecimal.valueOf(0.02))))));
            if (easeFactor.compareTo(MIN_EASE_FACTOR) < 0) {
                easeFactor = MIN_EASE_FACTOR;
            }
            status = repetitions >= 3 ? VocabProgressStatus.MASTERED : VocabProgressStatus.REVIEW;
        }

        return new ProgressDoc(
                progress.userId(),
                progress.wordId(),
                progress.setId(),
                status,
                interval,
                easeFactor.setScale(2, RoundingMode.HALF_UP),
                repetitions,
                now.plus(interval, ChronoUnit.DAYS),
                now);
    }

    private VocabSetCard toSetCard(VocabSet set) {
        return new VocabSetCard(
                set.getId(),
                set.getTitle(),
                set.getTopic(),
                set.getLevel(),
                wordsForSet(set.getId()).size(),
                false);
    }

    private MyVocabSetCard toMySetCard(Long userId, VocabSet set) {
        long total = wordsForSet(set.getId()).size();
        long mastered = progressForSet(userId, set.getId()).stream()
                .filter(progress -> progress.status() == VocabProgressStatus.MASTERED)
                .count();
        int percent = total == 0 ? 0 : (int) Math.round((mastered * 100.0) / total);
        VocabFolder folder = set.getFolder();
        return new MyVocabSetCard(
                set.getId(),
                set.getTitle(),
                StringUtils.hasText(set.getDescription()) ? set.getDescription() : "Personal vocabulary set",
                StringUtils.hasText(set.getIcon()) ? set.getIcon() : "*",
                folder == null ? null : folder.getId(),
                folder == null ? null : folder.getName(),
                total,
                mastered,
                percent);
    }

    private VocabProgressSetCard toProgressSetCard(Long userId, VocabSet set) {
        List<ProgressDoc> progress = progressForSet(userId, set.getId());
        long total = wordsForSet(set.getId()).size();
        long learned = progress.size();
        long mastered = progress.stream().filter(item -> item.status() == VocabProgressStatus.MASTERED).count();
        long learning = Math.max(0, learned - mastered);
        Instant now = Instant.now();
        long due = progress.stream()
                .filter(item -> item.nextReviewAt() != null && !item.nextReviewAt().isAfter(now))
                .count();
        int percent = total == 0 ? 0 : (int) Math.round((mastered * 100.0) / total);
        String icon = StringUtils.hasText(set.getIcon()) ? set.getIcon() : "*";
        String sourceLabel = set.getCreatedBy() == null ? "Course set" : "My set";
        Instant lastReviewedAt = progress.stream()
                .map(ProgressDoc::lastReviewedAt)
                .filter(java.util.Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);
        return new VocabProgressSetCard(
                set.getId(),
                set.getTitle(),
                set.getTopic(),
                icon,
                sourceLabel,
                total,
                learned,
                learning,
                mastered,
                due,
                percent,
                lastReviewedAt);
    }

    private CommunityVocabFolderCard toCommunityFolderCard(VocabFolder folder) {
        long setCount = publishedSets().stream()
                .filter(set -> folder.getId().equals(folderId(set)))
                .count();
        long wordCount = publishedSets().stream()
                .filter(set -> folder.getId().equals(folderId(set)))
                .mapToLong(set -> wordsForSet(set.getId()).size())
                .sum();
        String ownerName = StringUtils.hasText(folder.getUser().getDisplayName())
                ? folder.getUser().getDisplayName()
                : userLabel(folder.getUser().getId());
        return new CommunityVocabFolderCard(folder.getId(), folder.getName(), ownerName, setCount, wordCount);
    }

    private String uniqueFolderName(Long userId, String sourceName) {
        String base = StringUtils.hasText(sourceName) ? sourceName.trim() : "Copied folder";
        List<String> existing = liveFolders().stream()
                .filter(folder -> userId.equals(folder.getUser().getId()))
                .map(folder -> folder.getName().trim().toLowerCase(Locale.ROOT))
                .toList();
        if (!existing.contains(base.toLowerCase(Locale.ROOT))) {
            return base;
        }
        for (int i = 2; i < 1000; i++) {
            String candidate = base + " (" + i + ")";
            if (!existing.contains(candidate.toLowerCase(Locale.ROOT))) {
                return candidate;
            }
        }
        return base + " copy";
    }

    private VocabSet copySetAsNew(Long userId, VocabSet sourceSet, VocabFolder targetFolder) {
        VocabSet targetSet = copySetShell(userId, sourceSet, targetFolder);
        copyWords(sourceSet, targetSet);
        return targetSet;
    }

    private VocabSet copySetShell(Long userId, VocabSet sourceSet, VocabFolder targetFolder) {
        long id = nextId(SETS);
        Instant now = Instant.now();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("createdById", userId);
        data.put("folderId", targetFolder == null ? null : targetFolder.getId());
        data.put("folderName", targetFolder == null ? null : targetFolder.getName());
        data.put("folderPublicShared", targetFolder != null && targetFolder.isPublicShared());
        data.put("title", sourceSet.getTitle());
        data.put("topic", "Copied vocabulary set");
        data.put("description", cleanOptional(sourceSet.getDescription()));
        data.put("icon", normalizeIcon(sourceSet.getIcon()));
        data.put("level", "Personal vocabulary");
        data.put("status", ContentStatus.PUBLISHED.name());
        data.put("sourceType", SourceType.COMMUNITY.name());
        data.put("sourceNote", "Copied from community folder.");
        data.put("publishedAtMillis", now.toEpochMilli());
        data.put("updatedAtMillis", now.toEpochMilli());
        setDoc(SETS, id, data);
        return requirePublishedSet(id);
    }

    private int copyWords(VocabSet sourceSet, VocabSet targetSet) {
        int copied = 0;
        for (VocabWord sourceWord : wordsForSet(sourceSet.getId())) {
            String normalizedWord = sourceWord.getWord().trim().toLowerCase(Locale.ROOT);
            if (wordExists(targetSet.getId(), normalizedWord)) {
                continue;
            }
            long id = nextId(WORDS);
            Instant now = Instant.now();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", id);
            data.put("setId", targetSet.getId());
            data.put("word", normalizedWord);
            data.put("meaning", sourceWord.getMeaning());
            data.put("partOfSpeech", cleanOptional(sourceWord.getPartOfSpeech()));
            data.put("phonetic", cleanOptional(sourceWord.getPhonetic()));
            data.put("example", exampleForWord(sourceWord));
            data.put("audioUrl", cleanOptional(sourceWord.getAudioUrl()));
            data.put("status", ContentStatus.PUBLISHED.name());
            data.put("sourceType", SourceType.COMMUNITY.name());
            data.put("sourceNote", "Copied from community vocabulary set " + sourceSet.getId() + ".");
            data.put("licenseNote", cleanOptional(sourceWord.getLicenseNote()));
            data.put("publishedAtMillis", now.toEpochMilli());
            data.put("updatedAtMillis", now.toEpochMilli());
            setDoc(WORDS, id, data);
            copied++;
        }
        setDoc(SETS, targetSet.getId(), Map.of("updatedAtMillis", Instant.now().toEpochMilli()));
        return copied;
    }

    private List<AiVocabCandidate> parseDelimitedWords(String text) {
        if (!StringUtils.hasText(text)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vocabulary content is required");
        }
        List<List<String>> rows = text.contains(",") && !text.contains("|")
                ? parseCsv(text)
                : text.lines()
                        .map(this::parseDelimitedLine)
                        .filter(row -> row.stream().anyMatch(StringUtils::hasText))
                        .toList();
        return rowsToCandidates(rows);
    }

    private List<String> parseDelimitedLine(String line) {
        String trimmed = line == null ? "" : line.trim();
        if (!StringUtils.hasText(trimmed)) {
            return List.of();
        }
        if (!trimmed.contains("|") && !trimmed.contains("\t") && !trimmed.contains(",")) {
            String[] spaced = trimmed.split("\\s{2,}", -1);
            if (spaced.length > 1) {
                return java.util.Arrays.stream(spaced).map(String::trim).toList();
            }
            String[] parts = trimmed.split("\\s+", 2);
            return parts.length == 2 ? List.of(parts[0].trim(), "", "", parts[1].trim()) : List.of(trimmed);
        }
        String delimiter = trimmed.contains("|") ? "\\|" : trimmed.contains("\t") ? "\t" : ",";
        return java.util.Arrays.stream(trimmed.split(delimiter, -1))
                .map(String::trim)
                .toList();
    }

    private List<AiVocabCandidate> parseExcelWords(MultipartFile file) {
        try (InputStream inputStream = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(inputStream)) {
            DataFormatter formatter = new DataFormatter();
            List<List<String>> rows = new ArrayList<>();
            for (Sheet sheet : workbook) {
                for (Row row : sheet) {
                    List<String> cells = new ArrayList<>();
                    short lastCell = row.getLastCellNum();
                    if (lastCell < 0) {
                        continue;
                    }
                    for (int i = 0; i < lastCell; i++) {
                        cells.add(formatter.formatCellValue(row.getCell(i)).trim());
                    }
                    if (cells.stream().anyMatch(StringUtils::hasText)) {
                        rows.add(cells);
                    }
                }
            }
            return rowsToCandidates(rows);
        } catch (IOException | RuntimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot read Excel file", exception);
        }
    }

    private List<AiVocabCandidate> rowsToCandidates(List<List<String>> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No vocabulary rows found");
        }
        Map<String, Integer> header = looksLikeHeader(rows.get(0)) ? headerMap(rows.get(0)) : Map.of();
        int start = header.isEmpty() ? 0 : 1;
        List<AiVocabCandidate> candidates = new ArrayList<>();
        for (int i = start; i < rows.size(); i++) {
            List<String> row = rows.get(i);
            String word = header.isEmpty() ? cellAt(row, 0) : cell(row, header, "word", "từ vựng", "tu vung", "vocabulary");
            String phonetic = header.isEmpty() ? cellAt(row, 1) : cell(row, header, "phonetic", "phiên âm", "phien am");
            String partOfSpeech = header.isEmpty() ? cellAt(row, 2) : cell(row, header, "partOfSpeech", "part of speech", "loại từ", "loai tu", "pos");
            String meaning = header.isEmpty() ? cellAt(row, 3) : cell(row, header, "meaning", "nghĩa", "nghia", "definition");
            String example = header.isEmpty() ? cellAt(row, 4) : cell(row, header, "example", "ví dụ", "vi du");
            String note = header.isEmpty() ? cellAt(row, 5) : cell(row, header, "note", "ghi chú", "ghi chu");

            if (!StringUtils.hasText(meaning) && StringUtils.hasText(partOfSpeech)) {
                meaning = partOfSpeech;
                partOfSpeech = "";
            }
            if (!StringUtils.hasText(word) || !StringUtils.hasText(meaning)) {
                continue;
            }
            candidates.add(new AiVocabCandidate(word, meaning, partOfSpeech, phonetic, example, note, "manual"));
        }
        if (candidates.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No valid vocabulary rows found");
        }
        return candidates;
    }

    private boolean looksLikeHeader(List<String> row) {
        String joined = row.stream()
                .map(this::normalizeHeader)
                .collect(Collectors.joining(" "));
        return joined.contains("word")
                || joined.contains("vocabulary")
                || joined.contains("meaning")
                || joined.contains("tu vung")
                || joined.contains("nghia");
    }

    private String readTextFile(MultipartFile file) {
        try {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot read import file", exception);
        }
    }

    private String extractPdfText(MultipartFile file) {
        try (InputStream inputStream = file.getInputStream();
             PDDocument document = PDDocument.load(inputStream)) {
            return new PDFTextStripper().getText(document);
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot read PDF file", exception);
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
        Map<String, Integer> header = new LinkedHashMap<>();
        for (int i = 0; i < headerRow.size(); i++) {
            header.put(normalizeHeader(headerRow.get(i)), i);
        }
        return header;
    }

    private String cell(List<String> row, Map<String, Integer> header, String... keys) {
        for (String key : keys) {
            Integer index = header.get(normalizeHeader(key));
            if (index != null) {
                return cellAt(row, index);
            }
        }
        return "";
    }

    private String cellAt(List<String> row, int index) {
        return index >= 0 && index < row.size() ? row.get(index) : "";
    }

    private String normalizeHeader(String value) {
        if (value == null) {
            return "";
        }
        String normalized = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .trim();
        return normalized.replaceAll("[^a-z0-9]+", " ").trim();
    }

    private boolean matchesMastery(VocabWord word, Map<Long, ProgressDoc> progressByWordId, String mastery, Instant now) {
        if ("all".equals(mastery)) {
            return true;
        }
        ProgressDoc progress = progressByWordId.get(word.getId());
        if ("due".equals(mastery)) {
            return progress != null
                    && progress.nextReviewAt() != null
                    && !progress.nextReviewAt().isAfter(now);
        }
        boolean mastered = progress != null && progress.status() == VocabProgressStatus.MASTERED;
        return "mastered".equals(mastery) ? mastered : !mastered;
    }

    private void assertSetAccessible(VocabSet set, Long userId) {
        if (isSetAccessible(set, userId)) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found");
    }

    private boolean isSetAccessible(VocabSet set, Long userId) {
        if (set == null) {
            return false;
        }
        if (set.getCreatedBy() == null) {
            return true;
        }
        if (isSetPublicShared(set)) {
            return true;
        }
        return userId != null && set.getCreatedBy().getId().equals(userId);
    }

    private boolean isSetPublicShared(VocabSet set) {
        return set.getFolder() != null && set.getFolder().isPublicShared();
    }

    private String normalizeMastery(String mastery) {
        return switch (mastery == null ? "" : mastery) {
            case "all", "mastered", "due" -> mastery;
            default -> "learning";
        };
    }

    private int parseAmount(String amount, int total) {
        if ("all".equals(amount)) {
            return Math.max(0, total);
        }
        try {
            return Math.max(1, Math.min(Integer.parseInt(amount), total));
        } catch (NumberFormatException exception) {
            return Math.min(20, Math.max(1, total));
        }
    }

    private String normalizeIcon(String icon) {
        String cleaned = cleanOptional(icon);
        return cleaned == null || cleaned.length() > 8 ? "*" : cleaned;
    }

    private void requireUserId(Long userId) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
    }

    private String cleanOptional(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private List<String> excludeExistingWords(List<String> suggestedWords, List<String> existingWords, int limit) {
        List<String> existing = existingWords == null ? List.of() : existingWords.stream()
                .filter(StringUtils::hasText)
                .map(word -> word.trim().toLowerCase(Locale.ROOT))
                .toList();
        List<String> filteredWords = new ArrayList<>();
        if (suggestedWords == null) {
            return filteredWords;
        }
        for (String suggestedWord : suggestedWords) {
            if (!StringUtils.hasText(suggestedWord)) {
                continue;
            }
            String normalized = suggestedWord.trim().toLowerCase(Locale.ROOT);
            if (existing.contains(normalized) || filteredWords.contains(normalized)) {
                continue;
            }
            filteredWords.add(normalized);
            if (filteredWords.size() >= limit) {
                break;
            }
        }
        return filteredWords;
    }

    private String exampleOrFallback(AiVocabCandidate candidate) {
        return exampleOrFallback(candidate.word(), candidate.partOfSpeech(), candidate.example());
    }

    private String exampleForWord(VocabWord word) {
        return exampleOrFallback(word.getWord(), word.getPartOfSpeech(), word.getExample());
    }

    private String exampleOrFallback(String rawWord, String rawPartOfSpeech, String rawExample) {
        String example = cleanOptional(rawExample);
        String word = rawWord.trim().toLowerCase(Locale.ROOT);
        if (isUsableExample(example, word)) {
            return example;
        }
        String partOfSpeech = cleanOptional(rawPartOfSpeech);
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

    private boolean isUsableExample(String example, String word) {
        if (!StringUtils.hasText(example) || !StringUtils.hasText(word)) {
            return false;
        }
        String trimmed = example.trim();
        if (trimmed.length() < 12 || trimmed.length() > 180) {
            return false;
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.startsWith("a ") || lower.startsWith("an ") || lower.startsWith("the act of ")
                || lower.startsWith("one who ") || lower.startsWith("important types ")) {
            return false;
        }
        return trimmed.matches("(?is).*\\b" + java.util.regex.Pattern.quote(word.toLowerCase(Locale.ROOT)) + "\\b.*")
                && (trimmed.endsWith(".") || trimmed.endsWith("?") || trimmed.endsWith("!"));
    }

    private List<VocabSet> publishedSets() {
        ensureSeedData();
        return documents(SETS).stream()
                .filter(doc -> longValue(doc, "deletedAtMillis") == null)
                .map(this::toSet)
                .filter(set -> set.getStatus() == ContentStatus.PUBLISHED)
                .toList();
    }

    private List<VocabWord> publishedWords() {
        ensureSeedData();
        return documents(WORDS).stream()
                .filter(doc -> longValue(doc, "deletedAtMillis") == null)
                .map(this::toWord)
                .filter(word -> word.getStatus() == ContentStatus.PUBLISHED)
                .toList();
    }

    private List<VocabFolder> liveFolders() {
        ensureSeedData();
        return documents(FOLDERS).stream()
                .filter(doc -> longValue(doc, "deletedAtMillis") == null)
                .map(this::toFolder)
                .toList();
    }

    private List<VocabWord> wordsForSet(Long setId) {
        return publishedWords().stream()
                .filter(word -> setId.equals(folderlessSetId(word)))
                .sorted(Comparator.comparing(VocabWord::getId))
                .toList();
    }

    private List<VocabWordCard> wordCards(List<VocabWord> words) {
        return words.stream().map(this::toWordCard).toList();
    }

    private VocabWordCard toWordCard(VocabWord word) {
        return new VocabWordCard(
                word.getId(),
                word.getWord(),
                word.getMeaning(),
                word.getPartOfSpeech(),
                word.getPhonetic(),
                exampleForWord(word),
                word.getAudioUrl());
    }

    private Optional<VocabWord> findWord(Long wordId) {
        return publishedWords().stream()
                .filter(word -> wordId.equals(word.getId()))
                .findFirst();
    }

    private VocabSet requirePublishedSet(Long setId) {
        return publishedSets().stream()
                .filter(set -> setId.equals(set.getId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
    }

    private VocabSet requireOwnedSet(Long userId, Long setId) {
        VocabSet set = requirePublishedSet(setId);
        if (!isOwner(set, userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found");
        }
        return set;
    }

    private VocabFolder requireOwnedFolder(Long userId, Long folderId) {
        return liveFolders().stream()
                .filter(folder -> folderId.equals(folder.getId()) && userId.equals(folder.getUser().getId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
    }

    private VocabFolder requirePublicFolder(Long folderId) {
        return liveFolders().stream()
                .filter(folder -> folderId.equals(folder.getId()) && folder.isPublicShared())
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
    }

    private boolean isOwner(VocabSet set, Long userId) {
        return userId != null && set.getCreatedBy() != null && userId.equals(set.getCreatedBy().getId());
    }

    private Long folderId(VocabSet set) {
        return set.getFolder() == null ? null : set.getFolder().getId();
    }

    private Long folderlessSetId(VocabWord word) {
        return word.getSet() == null ? null : word.getSet().getId();
    }

    private Comparator<VocabSet> updatedDesc() {
        return Comparator.comparing(VocabSet::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private Comparator<VocabFolder> folderUpdatedDesc() {
        return Comparator.comparing(VocabFolder::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private List<ProgressDoc> progressForUser(Long userId) {
        if (userId == null) {
            return List.of();
        }
        return documents(PROGRESS).stream()
                .filter(doc -> userId.equals(longValue(doc, "userId")))
                .map(this::toProgress)
                .toList();
    }

    private List<ProgressDoc> progressForSet(Long userId, Long setId) {
        if (userId == null) {
            return List.of();
        }
        return progressForUser(userId).stream()
                .filter(progress -> setId.equals(progress.setId()))
                .toList();
    }

    private Optional<ProgressDoc> findProgress(Long userId, Long wordId) {
        return progressForUser(userId).stream()
                .filter(progress -> wordId.equals(progress.wordId()))
                .findFirst();
    }

    private void saveProgress(ProgressDoc progress) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("userId", progress.userId());
        data.put("wordId", progress.wordId());
        data.put("setId", progress.setId());
        data.put("status", progress.status().name());
        data.put("interval", progress.interval());
        data.put("easeFactor", progress.easeFactor().doubleValue());
        data.put("repetitions", progress.repetitions());
        data.put("nextReviewAtMillis", millis(progress.nextReviewAt()));
        data.put("lastReviewedAtMillis", millis(progress.lastReviewedAt()));
        setDoc(PROGRESS, progress.userId() + "_" + progress.wordId(), data);
    }

    private boolean wordExists(Long setId, String normalizedWord) {
        return wordsForSet(setId).stream()
                .map(VocabWord::getWord)
                .filter(StringUtils::hasText)
                .map(word -> word.trim().toLowerCase(Locale.ROOT))
                .anyMatch(normalizedWord::equals);
    }

    private void touchFolder(Long folderId) {
        setDoc(FOLDERS, folderId, Map.of("updatedAtMillis", Instant.now().toEpochMilli()));
    }

    private VocabSet toSet(DocumentSnapshot doc) {
        VocabSet set = new VocabSet();
        Long id = longValue(doc, "id");
        set.setId(id == null ? Long.parseLong(doc.getId()) : id);
        Long createdById = longValue(doc, "createdById");
        if (createdById != null) {
            set.setCreatedBy(stubUser(createdById, null));
        }
        Long folderId = longValue(doc, "folderId");
        if (folderId != null) {
            set.setFolder(stubFolder(folderId, stringValue(doc, "folderName"), boolValue(doc, "folderPublicShared")));
        }
        set.setTitle(defaultString(stringValue(doc, "title"), "Vocabulary set"));
        set.setTopic(defaultString(stringValue(doc, "topic"), "Vocabulary"));
        set.setDescription(stringValue(doc, "description"));
        set.setIcon(stringValue(doc, "icon"));
        set.setLevel(stringValue(doc, "level"));
        set.setStatus(enumValue(ContentStatus.class, stringValue(doc, "status"), ContentStatus.PUBLISHED));
        set.setSourceType(enumValue(SourceType.class, stringValue(doc, "sourceType"), SourceType.MANUAL));
        set.setSourceNote(stringValue(doc, "sourceNote"));
        set.setLicenseNote(stringValue(doc, "licenseNote"));
        set.setPublishedAt(instantValue(doc, "publishedAtMillis"));
        set.setUpdatedAt(instantValue(doc, "updatedAtMillis"));
        set.setDeletedAt(instantValue(doc, "deletedAtMillis"));
        return set;
    }

    private VocabWord toWord(DocumentSnapshot doc) {
        VocabWord word = new VocabWord();
        Long id = longValue(doc, "id");
        word.setId(id == null ? Long.parseLong(doc.getId()) : id);
        Long setId = longValue(doc, "setId");
        if (setId != null) {
            VocabSet set = new VocabSet();
            set.setId(setId);
            word.setSet(set);
        }
        word.setWord(defaultString(stringValue(doc, "word"), ""));
        word.setMeaning(defaultString(stringValue(doc, "meaning"), ""));
        word.setPartOfSpeech(stringValue(doc, "partOfSpeech"));
        word.setPhonetic(stringValue(doc, "phonetic"));
        word.setExample(stringValue(doc, "example"));
        word.setAudioUrl(stringValue(doc, "audioUrl"));
        word.setStatus(enumValue(ContentStatus.class, stringValue(doc, "status"), ContentStatus.PUBLISHED));
        word.setSourceType(enumValue(SourceType.class, stringValue(doc, "sourceType"), SourceType.MANUAL));
        word.setSourceNote(stringValue(doc, "sourceNote"));
        word.setLicenseNote(stringValue(doc, "licenseNote"));
        word.setPublishedAt(instantValue(doc, "publishedAtMillis"));
        word.setUpdatedAt(instantValue(doc, "updatedAtMillis"));
        word.setDeletedAt(instantValue(doc, "deletedAtMillis"));
        return word;
    }

    private VocabFolder toFolder(DocumentSnapshot doc) {
        VocabFolder folder = new VocabFolder();
        Long id = longValue(doc, "id");
        Long userId = longValue(doc, "userId");
        folder.setId(id == null ? Long.parseLong(doc.getId()) : id);
        folder.setUser(stubUser(userId, stringValue(doc, "ownerName")));
        folder.setName(defaultString(stringValue(doc, "name"), "Folder"));
        folder.setPublicShared(boolValue(doc, "publicShared"));
        folder.setSharedAt(instantValue(doc, "sharedAtMillis"));
        folder.setCreatedAt(instantValue(doc, "createdAtMillis"));
        folder.setUpdatedAt(instantValue(doc, "updatedAtMillis"));
        folder.setDeletedAt(instantValue(doc, "deletedAtMillis"));
        return folder;
    }

    private ProgressDoc toProgress(DocumentSnapshot doc) {
        return new ProgressDoc(
                longValue(doc, "userId"),
                longValue(doc, "wordId"),
                longValue(doc, "setId"),
                enumValue(VocabProgressStatus.class, stringValue(doc, "status"), VocabProgressStatus.NEW),
                intValue(doc, "interval", 0),
                BigDecimal.valueOf(doubleValue(doc, "easeFactor", 2.50)).setScale(2, RoundingMode.HALF_UP),
                intValue(doc, "repetitions", 0),
                instantValue(doc, "nextReviewAtMillis"),
                instantValue(doc, "lastReviewedAtMillis"));
    }

    private User stubUser(Long id, String displayName) {
        User user = new User();
        user.setId(id);
        user.setFirebaseUid(id == null ? null : "firestore-user-" + id);
        user.setEmail(id == null ? "unknown@firebase.local" : "user-" + id + "@firebase.local");
        user.setDisplayName(displayName);
        user.setRole(UserRole.STUDENT);
        return user;
    }

    private VocabFolder stubFolder(Long id, String name, boolean publicShared) {
        VocabFolder folder = new VocabFolder();
        folder.setId(id);
        folder.setName(name);
        folder.setPublicShared(publicShared);
        return folder;
    }

    private void ensureSeedData() {
        if (seedChecked.get()) {
            return;
        }
        synchronized (seedChecked) {
            if (seedChecked.get()) {
                return;
            }
            if (!documents(SETS, false).isEmpty()) {
                seedChecked.set(true);
                return;
            }
            Instant now = Instant.now();
            Map<String, Object> set = new LinkedHashMap<>();
            set.put("id", 1L);
            set.put("title", "TOEIC Office Essentials");
            set.put("topic", "Business");
            set.put("level", "B1");
            set.put("status", ContentStatus.PUBLISHED.name());
            set.put("sourceType", SourceType.MANUAL.name());
            set.put("publishedAtMillis", now.toEpochMilli());
            set.put("updatedAtMillis", now.toEpochMilli());
            setDoc(SETS, 1L, set, false);
            seedWord(1L, 1L, "invoice", "A document listing goods or services and the amount to pay.",
                    "/'in.vois/", "Please send the invoice before Friday.", now);
            seedWord(2L, 1L, "deadline", "The latest time or date by which something must be completed.",
                    "/'ded.lain/", "The deadline for the report is Monday.", now);
            seedWord(3L, 1L, "schedule", "A plan that lists events or tasks and their times.",
                    "/'sked.ju:l/", "The meeting schedule has changed.", now);
            setDoc(COUNTERS, SETS, Map.of("value", 1L), false);
            setDoc(COUNTERS, WORDS, Map.of("value", 3L), false);
            setDoc(COUNTERS, FOLDERS, Map.of("value", 0L), false);
            seedChecked.set(true);
        }
    }

    private void seedWord(Long id, Long setId, String word, String meaning, String phonetic, String example, Instant now) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("setId", setId);
        data.put("word", word);
        data.put("meaning", meaning);
        data.put("phonetic", phonetic);
        data.put("example", example);
        data.put("status", ContentStatus.PUBLISHED.name());
        data.put("sourceType", SourceType.MANUAL.name());
        data.put("publishedAtMillis", now.toEpochMilli());
        data.put("updatedAtMillis", now.toEpochMilli());
        setDoc(WORDS, id, data, false);
    }

    private long nextId(String counterName) {
        ensureSeedData();
        try {
            Firestore db = firestore();
            DocumentReference counterRef = db.collection(COUNTERS).document(counterName);
            DocumentSnapshot snapshot = await(counterRef.get());
            if (!snapshot.exists()) {
                setDoc(COUNTERS, counterName, Map.of("value", maxId(counterName)));
            }
            return await(db.runTransaction(transaction -> {
                DocumentSnapshot counter = transaction.get(counterRef).get();
                long current = counter.exists() && longValue(counter, "value") != null ? longValue(counter, "value") : 0L;
                long next = current + 1;
                transaction.set(counterRef, Map.of("value", next), SetOptions.merge());
                return next;
            }));
        } catch (Exception ex) {
            throw firestoreFailure(ex);
        }
    }

    private long maxId(String collection) {
        return documents(collection).stream()
                .map(doc -> longValue(doc, "id"))
                .filter(java.util.Objects::nonNull)
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L);
    }

    private List<DocumentSnapshot> documents(String collection) {
        return documents(collection, true);
    }

    private List<DocumentSnapshot> documents(String collection, boolean seed) {
        if (seed) {
            ensureSeedData();
        }
        try {
            return new ArrayList<>(await(firestore().collection(collection).get()).getDocuments());
        } catch (Exception ex) {
            throw firestoreFailure(ex);
        }
    }

    private Firestore firestore() {
        return Optional.ofNullable(firestoreProvider.getIfAvailable())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Firestore is not configured"));
    }

    private void setDoc(String collection, Long id, Map<String, Object> data) {
        setDoc(collection, String.valueOf(id), data, true);
    }

    private void setDoc(String collection, String id, Map<String, Object> data) {
        setDoc(collection, id, data, true);
    }

    private void setDoc(String collection, Long id, Map<String, Object> data, boolean seed) {
        setDoc(collection, String.valueOf(id), data, seed);
    }

    private void setDoc(String collection, String id, Map<String, Object> data, boolean seed) {
        if (seed) {
            ensureSeedData();
        }
        try {
            await(firestore().collection(collection).document(id).set(data, SetOptions.merge()));
        } catch (Exception ex) {
            throw firestoreFailure(ex);
        }
    }

    private ResponseStatusException firestoreFailure(Exception ex) {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Firestore vocabulary storage failed", ex);
    }

    private <T> T await(ApiFuture<T> future) throws InterruptedException, ExecutionException {
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw ex;
        }
    }

    private <T> Page<T> page(List<T> items, Pageable pageable) {
        int start = (int) Math.min(pageable.getOffset(), items.size());
        int end = Math.min(start + pageable.getPageSize(), items.size());
        return new PageImpl<>(items.subList(start, end), pageable, items.size());
    }

    private boolean containsIgnoreCase(String value, String query) {
        return StringUtils.hasText(value)
                && StringUtils.hasText(query)
                && value.toLowerCase(Locale.ROOT).contains(query.trim().toLowerCase(Locale.ROOT));
    }

    private String userLabel(Long userId) {
        return userId == null ? "Unknown user" : "User #" + userId;
    }

    private String defaultString(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }

    private Long longValue(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Long.parseLong(text);
        }
        return null;
    }

    private int intValue(DocumentSnapshot doc, String field, int fallback) {
        Long value = longValue(doc, field);
        return value == null ? fallback : value.intValue();
    }

    private double doubleValue(DocumentSnapshot doc, String field, double fallback) {
        Object value = doc.get(field);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            return Double.parseDouble(text);
        }
        return fallback;
    }

    private boolean boolValue(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof String text) {
            return Boolean.parseBoolean(text);
        }
        return false;
    }

    private String stringValue(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        return value == null ? null : value.toString();
    }

    private Instant instantValue(DocumentSnapshot doc, String field) {
        Long millis = longValue(doc, field);
        return millis == null ? null : Instant.ofEpochMilli(millis);
    }

    private Long millis(Instant instant) {
        return instant == null ? null : instant.toEpochMilli();
    }

    private <E extends Enum<E>> E enumValue(Class<E> type, String value, E fallback) {
        if (!StringUtils.hasText(value)) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, value);
        } catch (IllegalArgumentException ex) {
            return fallback;
        }
    }

    private record ProgressDoc(
            Long userId,
            Long wordId,
            Long setId,
            VocabProgressStatus status,
            int interval,
            BigDecimal easeFactor,
            int repetitions,
            Instant nextReviewAt,
            Instant lastReviewedAt) {
    }
}
