package com.englishwebapp.service;

import com.englishwebapp.dto.AiVocabCandidate;
import com.englishwebapp.dto.CommunityVocabFolderCard;
import com.englishwebapp.dto.CommunityVocabSetCard;
import com.englishwebapp.dto.MyVocabFolderCard;
import com.englishwebapp.dto.MyVocabSetCard;
import com.englishwebapp.dto.VocabReviewResponse;
import com.englishwebapp.dto.VocabProgressSetCard;
import com.englishwebapp.dto.VocabSetDetail;
import com.englishwebapp.dto.VocabSetCard;
import com.englishwebapp.dto.VocabSetSession;
import com.englishwebapp.dto.VocabWordCard;
import com.englishwebapp.dto.VocabWordRow;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.UserVocabProgress;
import com.englishwebapp.entity.VocabFolder;
import com.englishwebapp.entity.VocabProgressStatus;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.entity.VocabWord;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.UserVocabProgressRepository;
import com.englishwebapp.repository.VocabFolderRepository;
import com.englishwebapp.repository.VocabSetRepository;
import com.englishwebapp.repository.VocabWordRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class VocabService {

    private static final BigDecimal MIN_EASE_FACTOR = BigDecimal.valueOf(1.30);
    private static final int DAILY_NEW_WORD_GOAL = 20;

    private final VocabSetRepository vocabSetRepository;
    private final VocabWordRepository vocabWordRepository;
    private final UserVocabProgressRepository userVocabProgressRepository;
    private final VocabFolderRepository vocabFolderRepository;
    private final UserRepository userRepository;
    private final GeminiVocabularyService geminiVocabularyService;
    private final DictionaryVocabularyService dictionaryVocabularyService;

    @Transactional(readOnly = true)
    public Page<VocabSet> findSets(String topic, Pageable pageable) {
        if (StringUtils.hasText(topic)) {
            return vocabSetRepository.findByTopicContainingIgnoreCaseAndCreatedByIsNullAndStatus(
                    topic,
                    ContentStatus.PUBLISHED,
                    pageable);
        }
        return vocabSetRepository.findByCreatedByIsNullAndStatus(ContentStatus.PUBLISHED, pageable);
    }

    @Transactional(readOnly = true)
    public Page<VocabSetCard> findSetCards(String topic, Pageable pageable) {
        return findSets(topic, pageable).map(set -> new VocabSetCard(
                set.getId(),
                set.getTitle(),
                set.getTopic(),
                set.getLevel(),
                vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED),
                false));
    }

    @Transactional(readOnly = true)
    public List<VocabSetCard> findPracticeSetOptions(Long userId) {
        List<VocabSetCard> adminSets = vocabSetRepository.findByCreatedByIsNullAndStatus(ContentStatus.PUBLISHED, PageRequest.of(0, 200))
                .stream()
                .map(this::toSetCard)
                .toList();
        if (userId == null) {
            return adminSets;
        }
        List<VocabSetCard> mySets = vocabSetRepository.findByCreatedByIdAndStatusOrderByUpdatedAtDesc(userId, ContentStatus.PUBLISHED)
                .stream()
                .map(this::toSetCard)
                .toList();
        Map<Long, VocabSetCard> options = new LinkedHashMap<>();
        mySets.forEach(set -> options.putIfAbsent(set.id(), set));
        adminSets.forEach(set -> options.putIfAbsent(set.id(), set));
        return List.copyOf(options.values());
    }

    @Transactional(readOnly = true)
    public List<MyVocabSetCard> findMySetCards(Long userId) {
        if (userId == null) {
            return List.of();
        }
        return vocabSetRepository.findByCreatedByIdAndStatusOrderByUpdatedAtDesc(userId, ContentStatus.PUBLISHED)
                .stream()
                .map(set -> {
                    long total = vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED);
                    long mastered = userVocabProgressRepository.countByUserIdAndSetIdAndStatus(
                            userId,
                            set.getId(),
                            VocabProgressStatus.MASTERED);
                    int percent = total == 0 ? 0 : (int) Math.round((mastered * 100.0) / total);
                    return new MyVocabSetCard(
                            set.getId(),
                            set.getTitle(),
                            StringUtils.hasText(set.getDescription()) ? set.getDescription() : "Bộ từ vựng riêng của bạn",
                            StringUtils.hasText(set.getIcon()) ? set.getIcon() : "⭐",
                            null,
                            null,
                            total,
                            mastered,
                            percent);
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MyVocabSetCard> findMySetCards(Long userId, Long folderId) {
        if (userId == null) {
            return List.of();
        }
        if (folderId == null) {
            return vocabSetRepository.findByCreatedByIdAndStatusOrderByUpdatedAtDesc(userId, ContentStatus.PUBLISHED)
                    .stream()
                    .map(set -> toMySetCard(userId, set))
                    .toList();
        }
        vocabFolderRepository.findByIdAndUserId(folderId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        return vocabSetRepository.findByCreatedByIdAndFolderIdAndStatusOrderByUpdatedAtDesc(
                        userId,
                        folderId,
                        ContentStatus.PUBLISHED)
                .stream()
                .map(set -> toMySetCard(userId, set))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MyVocabFolderCard> findMyFolderCards(Long userId) {
        return findMyFolderCards(userId, null);
    }

    @Transactional(readOnly = true)
    public List<MyVocabFolderCard> findMyFolderCards(Long userId, String search) {
        if (userId == null) {
            return List.of();
        }
        List<VocabFolder> folders = StringUtils.hasText(search)
                ? vocabFolderRepository.findByUserIdAndNameContainingIgnoreCaseOrderByUpdatedAtDesc(userId, search.trim())
                : vocabFolderRepository.findByUserIdOrderByUpdatedAtDesc(userId);
        return folders
                .stream()
                .map(folder -> {
                    long setCount = vocabSetRepository.countByFolderIdAndCreatedByIdAndStatus(
                            folder.getId(),
                            userId,
                            ContentStatus.PUBLISHED);
                    long wordCount = vocabSetRepository.findByCreatedByIdAndFolderIdAndStatusOrderByUpdatedAtDesc(
                                    userId,
                                    folder.getId(),
                                    ContentStatus.PUBLISHED)
                            .stream()
                            .mapToLong(set -> vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED))
                            .sum();
                    return new MyVocabFolderCard(
                            folder.getId(),
                            folder.getName(),
                            setCount,
                            wordCount,
                            folder.isPublicShared());
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CommunityVocabFolderCard> findCommunityFolderCards(String search) {
        List<VocabFolder> folders = StringUtils.hasText(search)
                ? vocabFolderRepository.findByNameContainingIgnoreCaseAndPublicSharedTrueOrderBySharedAtDesc(search.trim())
                : vocabFolderRepository.findByPublicSharedTrueOrderBySharedAtDesc();
        return folders.stream()
                .map(this::toCommunityFolderCard)
                .toList();
    }

    @Transactional(readOnly = true)
    public CommunityVocabFolderCard getCommunityFolderCard(Long folderId) {
        return toCommunityFolderCard(vocabFolderRepository.findByIdAndPublicSharedTrue(folderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found")));
    }

    @Transactional(readOnly = true)
    public List<CommunityVocabSetCard> findCommunitySetCards(Long folderId) {
        vocabFolderRepository.findByIdAndPublicSharedTrue(folderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        return vocabSetRepository.findByFolderIdAndStatusOrderByUpdatedAtDesc(folderId, ContentStatus.PUBLISHED)
                .stream()
                .map(set -> new CommunityVocabSetCard(
                        set.getId(),
                        set.getTitle(),
                        StringUtils.hasText(set.getDescription()) ? set.getDescription() : "Không có mô tả",
                        StringUtils.hasText(set.getIcon()) ? set.getIcon() : "⭐",
                        vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED)))
                .toList();
    }

    @Transactional(readOnly = true)
    public long totalWords() {
        return totalWords(null);
    }

    @Transactional(readOnly = true)
    public long totalWords(Long userId) {
        return vocabWordRepository.countAccessibleByStatus(userId, ContentStatus.PUBLISHED);
    }

    @Transactional(readOnly = true)
    public long learnedWords(Long userId) {
        return userId == null ? 0 : userVocabProgressRepository.countByUserId(userId);
    }

    @Transactional(readOnly = true)
    public long masteredWords(Long userId) {
        return userId == null ? 0 : userVocabProgressRepository.countByUserIdAndStatus(userId, VocabProgressStatus.MASTERED);
    }

    @Transactional(readOnly = true)
    public long dueWords(Long userId) {
        return userId == null ? 0 : userVocabProgressRepository.countByUserIdAndNextReviewAtLessThanEqual(userId, Instant.now());
    }

    public int dailyNewWordGoal() {
        return DAILY_NEW_WORD_GOAL;
    }

    @Transactional(readOnly = true)
    public long studiedWordsToday(Long userId) {
        if (userId == null) {
            return 0;
        }
        Instant startOfDay = LocalDate.now(ZoneId.systemDefault())
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant();
        return userVocabProgressRepository.countByUserIdAndLastReviewedAtGreaterThanEqual(userId, startOfDay);
    }

    @Transactional(readOnly = true)
    public List<VocabProgressSetCard> findProgressSetCards(Long userId) {
        if (userId == null) {
            return List.of();
        }
        Map<Long, VocabSet> setsById = new LinkedHashMap<>();
        vocabSetRepository.findByCreatedByIdAndStatusOrderByUpdatedAtDesc(userId, ContentStatus.PUBLISHED)
                .forEach(set -> setsById.putIfAbsent(set.getId(), set));
        vocabSetRepository.findByCreatedByIsNullAndStatus(ContentStatus.PUBLISHED, PageRequest.of(0, 100))
                .forEach(set -> setsById.putIfAbsent(set.getId(), set));
        List<VocabProgressSetCard> cards = new ArrayList<>();
        setsById.values().forEach(set -> cards.add(toProgressSetCard(userId, set)));
        return cards.stream()
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

    @Transactional(readOnly = true)
    public VocabSetSession getSession(Long setId) {
        VocabSet set = vocabSetRepository.findByIdAndStatus(setId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        return new VocabSetSession(set, vocabWordRepository.findBySetIdAndStatusOrderByIdAsc(setId, ContentStatus.PUBLISHED)
                .stream()
                .map(word -> new VocabWordCard(
                        word.getId(),
                        word.getWord(),
                        word.getMeaning(),
                        word.getPartOfSpeech(),
                        word.getPhonetic(),
                        exampleForWord(word),
                        word.getAudioUrl()))
                .toList());
    }

    @Transactional(readOnly = true)
    public VocabSetSession getFilteredSession(Long setId, Long userId, String mastery, String order, String amount) {
        VocabSet set = vocabSetRepository.findByIdAndStatus(setId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        assertSetAccessible(set, userId);
        List<VocabWord> words = vocabWordRepository.findBySetIdAndStatusOrderByIdAsc(setId, ContentStatus.PUBLISHED);
        Map<Long, UserVocabProgress> progressByWordId = userId == null
                ? Map.of()
                : userVocabProgressRepository.findByUserIdAndSetId(userId, setId)
                .stream()
                .collect(Collectors.toMap(progress -> progress.getWord().getId(), Function.identity()));
        String safeMastery = normalizeMastery(mastery);
        Instant now = Instant.now();
        List<VocabWordCard> cards = words.stream()
                .filter(word -> matchesMastery(word, progressByWordId, safeMastery, now))
                .map(word -> new VocabWordCard(
                        word.getId(),
                        word.getWord(),
                        word.getMeaning(),
                        word.getPartOfSpeech(),
                        word.getPhonetic(),
                        exampleForWord(word),
                        word.getAudioUrl()))
                .collect(Collectors.toList());
        if ("random".equals(order)) {
            Collections.shuffle(cards);
        }
        int limit = parseAmount(amount, cards.size());
        return new VocabSetSession(set, cards.stream().limit(limit).toList());
    }

    @Transactional
    public VocabSet createMySet(Long userId, String title, String description, String icon) {
        User user = requireUser(userId);
        VocabSet set = new VocabSet();
        set.setCreatedBy(user);
        set.setTitle(StringUtils.hasText(title) ? title.trim() : "Bộ từ vựng của tôi");
        set.setTopic("Bộ từ vựng của tôi");
        set.setDescription(cleanOptional(description));
        set.setIcon(normalizeIcon(icon));
        set.setLevel("Bộ từ vựng riêng của bạn");
        set.setStatus(ContentStatus.PUBLISHED);
        set.setSourceType(SourceType.MANUAL);
        Instant now = Instant.now();
        set.setPublishedAt(now);
        set.setUpdatedAt(now);
        return vocabSetRepository.save(set);
    }

    @Transactional
    public VocabFolder createMyFolder(Long userId, String name) {
        User user = requireUser(userId);
        if (!StringUtils.hasText(name)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Folder name is required");
        }
        VocabFolder folder = new VocabFolder();
        folder.setUser(user);
        folder.setName(name.trim());
        Instant now = Instant.now();
        folder.setCreatedAt(now);
        folder.setUpdatedAt(now);
        return vocabFolderRepository.save(folder);
    }

    @Transactional
    public void assignMySetToFolder(Long userId, Long setId, Long folderId) {
        requireUser(userId);
        VocabSet set = vocabSetRepository.findByIdAndCreatedByIdAndStatus(setId, userId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        VocabFolder folder = folderId == null ? null : vocabFolderRepository.findByIdAndUserId(folderId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        set.setFolder(folder);
        set.setUpdatedAt(Instant.now());
        if (folder != null) {
            folder.setUpdatedAt(Instant.now());
        }
    }

    @Transactional
    public void shareMyFolder(Long userId, Long folderId) {
        requireUser(userId);
        VocabFolder folder = vocabFolderRepository.findByIdAndUserId(folderId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        Instant now = Instant.now();
        folder.setPublicShared(true);
        folder.setSharedAt(now);
        folder.setUpdatedAt(now);
    }

    @Transactional
    public void renameMyFolder(Long userId, Long folderId, String name) {
        requireUser(userId);
        if (!StringUtils.hasText(name)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Folder name is required");
        }
        VocabFolder folder = vocabFolderRepository.findByIdAndUserId(folderId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        folder.setName(name.trim());
        folder.setUpdatedAt(Instant.now());
    }

    @Transactional
    public void deleteMyFolder(Long userId, Long folderId) {
        requireUser(userId);
        VocabFolder folder = vocabFolderRepository.findByIdAndUserId(folderId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        vocabSetRepository.findByFolderIdAndCreatedById(folderId, userId).forEach(set -> {
            set.setFolder(null);
            set.setUpdatedAt(Instant.now());
        });
        vocabFolderRepository.delete(folder);
    }

    @Transactional
    public VocabFolder copyCommunityFolder(Long userId, Long folderId) {
        User user = requireUser(userId);
        VocabFolder sourceFolder = vocabFolderRepository.findByIdAndPublicSharedTrue(folderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found"));
        VocabFolder targetFolder = new VocabFolder();
        targetFolder.setUser(user);
        targetFolder.setName(uniqueFolderName(userId, sourceFolder.getName()));
        Instant now = Instant.now();
        targetFolder.setCreatedAt(now);
        targetFolder.setUpdatedAt(now);
        VocabFolder savedFolder = vocabFolderRepository.save(targetFolder);
        vocabSetRepository.findByFolderIdAndStatusOrderByUpdatedAtDesc(folderId, ContentStatus.PUBLISHED)
                .forEach(sourceSet -> copySetAsNew(user, sourceSet, savedFolder));
        return savedFolder;
    }

    @Transactional
    public int copyCommunitySet(Long userId, Long sourceSetId, Long targetSetId) {
        User user = requireUser(userId);
        VocabSet sourceSet = vocabSetRepository.findPublicFolderSetByIdAndStatus(sourceSetId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        VocabSet targetSet = targetSetId == null
                ? copySetShell(user, sourceSet, null)
                : vocabSetRepository.findByIdAndCreatedByIdAndStatus(targetSetId, userId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Target vocabulary set not found"));
        return copyWords(sourceSet, targetSet);
    }

    @Transactional
    public void renameMySet(Long userId, Long setId, String title) {
        requireUser(userId);
        if (!StringUtils.hasText(title)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Set title is required");
        }
        VocabSet set = vocabSetRepository.findByIdAndCreatedByIdAndStatus(setId, userId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        set.setTitle(title.trim());
        set.setUpdatedAt(Instant.now());
    }

    @Transactional
    public void deleteMySet(Long userId, Long setId) {
        requireUser(userId);
        VocabSet set = vocabSetRepository.findByIdAndCreatedByIdAndStatus(setId, userId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        vocabSetRepository.delete(set);
    }

    @Transactional(readOnly = true)
    public VocabSetDetail getSetDetail(Long setId, Long userId) {
        VocabSet set = vocabSetRepository.findByIdAndStatus(setId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        assertSetAccessible(set, userId);
        List<VocabWord> words = vocabWordRepository.findBySetIdAndStatusOrderByIdAsc(setId, ContentStatus.PUBLISHED);
        Map<Long, UserVocabProgress> progressByWordId = userId == null
                ? Map.of()
                : userVocabProgressRepository.findByUserIdAndSetId(userId, setId)
                .stream()
                .collect(Collectors.toMap(progress -> progress.getWord().getId(), Function.identity()));
        long mastered = userId == null
                ? 0
                : userVocabProgressRepository.countByUserIdAndSetIdAndStatus(userId, setId, VocabProgressStatus.MASTERED);
        long learned = userId == null ? 0 : userVocabProgressRepository.countByUserIdAndSetId(userId, setId);
        int progressPercent = words.isEmpty() ? 0 : (int) Math.round((mastered * 100.0) / words.size());
        return new VocabSetDetail(
                set,
                words.size(),
                mastered,
                Math.max(0, learned - mastered),
                progressPercent,
                words.stream()
                        .map(word -> {
                            UserVocabProgress progress = progressByWordId.get(word.getId());
                            return new VocabWordRow(
                                    word.getId(),
                                    word.getWord(),
                                    word.getMeaning(),
                                    word.getPartOfSpeech(),
                                    word.getPhonetic(),
                                    exampleForWord(word),
                                    word.getAudioUrl(),
                                    progress != null && progress.getStatus() == VocabProgressStatus.MASTERED);
                        })
                        .toList());
    }

    @Transactional
    public int generateWordsWithAi(Long setId, Long userId, String mode, String input, int count, org.springframework.web.multipart.MultipartFile image) {
        return saveAiWords(setId, previewAiWords(setId, mode, input, count, image));
    }

    @Transactional(readOnly = true)
    public List<AiVocabCandidate> previewAiWords(Long setId, String mode, String input, int count, org.springframework.web.multipart.MultipartFile image) {
        vocabSetRepository.findByIdAndStatus(setId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        int safeCount = Math.max(1, Math.min(count, 50));
        List<String> existingWords = vocabWordRepository.findBySetIdAndStatusOrderByIdAsc(setId, ContentStatus.PUBLISHED)
                .stream()
                .map(word -> word.getWord().trim().toLowerCase())
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

    @Transactional
    public int saveAiWords(Long setId, List<AiVocabCandidate> candidates) {
        VocabSet set = vocabSetRepository.findByIdAndStatus(setId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        if (candidates == null || candidates.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No vocabulary words selected");
        }
        int created = 0;
        for (AiVocabCandidate candidate : candidates.stream().limit(50).toList()) {
            if (!StringUtils.hasText(candidate.word()) || !StringUtils.hasText(candidate.meaning())) {
                continue;
            }
            String normalizedWord = candidate.word().trim().toLowerCase();
            if (vocabWordRepository.existsBySetIdAndWordIgnoreCaseAndStatus(setId, normalizedWord, ContentStatus.PUBLISHED)) {
                continue;
            }
            VocabWord word = new VocabWord();
            word.setSet(set);
            word.setWord(normalizedWord);
            word.setMeaning(candidate.meaning().trim());
            word.setPartOfSpeech(cleanOptional(candidate.partOfSpeech()));
            word.setPhonetic(cleanOptional(candidate.phonetic()));
            word.setExample(exampleOrFallback(candidate));
            word.setStatus(ContentStatus.PUBLISHED);
            word.setSourceType(SourceType.AI_GENERATED);
            String source = cleanOptional(candidate.dictionarySource()) == null ? "dictionary" : candidate.dictionarySource().trim();
            String definition = cleanOptional(candidate.dictionaryDefinition()) == null ? "" : " Definition: " + candidate.dictionaryDefinition().trim();
            word.setSourceNote("AI suggested the word; dictionary data verified by " + source + "." + definition);
            word.setLicenseNote("AI-assisted vocabulary candidate verified with dictionary data for free learning use.");
            Instant now = Instant.now();
            word.setPublishedAt(now);
            word.setUpdatedAt(now);
            vocabWordRepository.save(word);
            created++;
        }
        if (created == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No new vocabulary words were saved");
        }
        return created;
    }

    @Transactional(readOnly = true)
    public VocabSetSession getReviewSession(Long userId, int size) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        VocabSet virtualSet = new VocabSet();
        virtualSet.setId(0L);
        virtualSet.setTitle("Ôn tập từ đến hạn");
        virtualSet.setTopic("SM-2 Review");
        virtualSet.setLevel("Personal");
        return new VocabSetSession(virtualSet, userVocabProgressRepository
                .findByUserIdAndNextReviewAtLessThanEqualOrderByNextReviewAtAsc(
                        userId,
                        Instant.now(),
                        PageRequest.of(0, Math.max(1, Math.min(size, 100))))
                .stream()
                .map(UserVocabProgress::getWord)
                .map(word -> new VocabWordCard(
                        word.getId(),
                        word.getWord(),
                        word.getMeaning(),
                        word.getPartOfSpeech(),
                        word.getPhonetic(),
                        exampleForWord(word),
                        word.getAudioUrl()))
                .toList());
    }

    @Transactional
    public VocabReviewResponse review(Long userId, Long wordId, int quality) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        VocabWord word = vocabWordRepository.findByIdAndStatus(wordId, ContentStatus.PUBLISHED)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary word not found"));
        UserVocabProgress progress = userVocabProgressRepository.findByUserIdAndWordId(userId, wordId)
                .orElseGet(UserVocabProgress::new);
        progress.setUser(user);
        progress.setWord(word);
        applySm2(progress, quality);
        UserVocabProgress saved = userVocabProgressRepository.save(progress);
        return new VocabReviewResponse(
                saved.getStatus(),
                saved.getInterval(),
                saved.getRepetitions(),
                saved.getEaseFactor().doubleValue(),
                saved.getNextReviewAt());
    }

    private void applySm2(UserVocabProgress progress, int quality) {
        BigDecimal easeFactor = progress.getEaseFactor();
        int repetitions = progress.getRepetitions();
        int interval = progress.getInterval();
        Instant now = Instant.now();

        if (quality < 3) {
            repetitions = 0;
            interval = 1;
            progress.setStatus(VocabProgressStatus.LEARNING);
        } else if (quality >= 5) {
            repetitions = Math.max(1, repetitions + 1);
            interval = 3;
            progress.setStatus(VocabProgressStatus.MASTERED);
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
            progress.setStatus(repetitions >= 3 ? VocabProgressStatus.MASTERED : VocabProgressStatus.REVIEW);
        }

        progress.setRepetitions(repetitions);
        progress.setInterval(interval);
        progress.setEaseFactor(easeFactor.setScale(2, RoundingMode.HALF_UP));
        progress.setLastReviewedAt(now);
        progress.setNextReviewAt(now.plus(interval, ChronoUnit.DAYS));
    }

    private VocabSetCard toSetCard(VocabSet set) {
        return new VocabSetCard(
                set.getId(),
                set.getTitle(),
                set.getTopic(),
                set.getLevel(),
                vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED),
                false);
    }

    private MyVocabSetCard toMySetCard(Long userId, VocabSet set) {
        long total = vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED);
        long mastered = userVocabProgressRepository.countByUserIdAndSetIdAndStatus(
                userId,
                set.getId(),
                VocabProgressStatus.MASTERED);
        int percent = total == 0 ? 0 : (int) Math.round((mastered * 100.0) / total);
        VocabFolder folder = set.getFolder();
        return new MyVocabSetCard(
                set.getId(),
                set.getTitle(),
                StringUtils.hasText(set.getDescription()) ? set.getDescription() : "Bộ từ vựng riêng của bạn",
                StringUtils.hasText(set.getIcon()) ? set.getIcon() : "⭐",
                folder == null ? null : folder.getId(),
                folder == null ? null : folder.getName(),
                total,
                mastered,
                percent);
    }

    private VocabProgressSetCard toProgressSetCard(Long userId, VocabSet set) {
        long total = vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED);
        long learned = userVocabProgressRepository.countByUserIdAndSetId(userId, set.getId());
        long mastered = userVocabProgressRepository.countByUserIdAndSetIdAndStatus(
                userId,
                set.getId(),
                VocabProgressStatus.MASTERED);
        long learning = Math.max(0, learned - mastered);
        long due = userVocabProgressRepository.countDueByUserIdAndSetId(userId, set.getId(), Instant.now());
        int percent = total == 0 ? 0 : (int) Math.round((mastered * 100.0) / total);
        String icon = StringUtils.hasText(set.getIcon()) ? set.getIcon() : "☆";
        String sourceLabel = set.getCreatedBy() == null ? "Bộ học" : "Bộ của tôi";
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
                userVocabProgressRepository.findLastReviewedAtByUserIdAndSetId(userId, set.getId()));
    }

    private CommunityVocabFolderCard toCommunityFolderCard(VocabFolder folder) {
        long setCount = vocabSetRepository.countByFolderIdAndCreatedByIdAndStatus(
                folder.getId(),
                folder.getUser().getId(),
                ContentStatus.PUBLISHED);
        long wordCount = vocabSetRepository.findByFolderIdAndStatusOrderByUpdatedAtDesc(folder.getId(), ContentStatus.PUBLISHED)
                .stream()
                .mapToLong(set -> vocabWordRepository.countBySetIdAndStatus(set.getId(), ContentStatus.PUBLISHED))
                .sum();
        String owner = StringUtils.hasText(folder.getUser().getDisplayName())
                ? folder.getUser().getDisplayName()
                : folder.getUser().getEmail();
        return new CommunityVocabFolderCard(folder.getId(), folder.getName(), owner, setCount, wordCount);
    }

    private String uniqueFolderName(Long userId, String sourceName) {
        String base = StringUtils.hasText(sourceName) ? sourceName.trim() : "Copied folder";
        List<String> existing = vocabFolderRepository.findByUserIdOrderByUpdatedAtDesc(userId)
                .stream()
                .map(folder -> folder.getName().trim().toLowerCase())
                .toList();
        if (!existing.contains(base.toLowerCase())) {
            return base;
        }
        for (int i = 2; i < 1000; i++) {
            String candidate = base + " (" + i + ")";
            if (!existing.contains(candidate.toLowerCase())) {
                return candidate;
            }
        }
        return base + " copy";
    }

    private VocabSet copySetAsNew(User user, VocabSet sourceSet, VocabFolder targetFolder) {
        VocabSet targetSet = copySetShell(user, sourceSet, targetFolder);
        copyWords(sourceSet, targetSet);
        return targetSet;
    }

    private VocabSet copySetShell(User user, VocabSet sourceSet, VocabFolder targetFolder) {
        VocabSet targetSet = new VocabSet();
        targetSet.setCreatedBy(user);
        targetSet.setFolder(targetFolder);
        targetSet.setTitle(sourceSet.getTitle());
        targetSet.setTopic("Bộ từ sao chép");
        targetSet.setDescription(cleanOptional(sourceSet.getDescription()));
        targetSet.setIcon(normalizeIcon(sourceSet.getIcon()));
        targetSet.setLevel("Bộ từ vựng riêng của bạn");
        targetSet.setStatus(ContentStatus.PUBLISHED);
        targetSet.setSourceType(SourceType.COMMUNITY);
        targetSet.setSourceNote("Copied from community folder.");
        Instant now = Instant.now();
        targetSet.setPublishedAt(now);
        targetSet.setUpdatedAt(now);
        return vocabSetRepository.save(targetSet);
    }

    private int copyWords(VocabSet sourceSet, VocabSet targetSet) {
        int copied = 0;
        for (VocabWord sourceWord : vocabWordRepository.findBySetIdAndStatusOrderByIdAsc(sourceSet.getId(), ContentStatus.PUBLISHED)) {
            String normalizedWord = sourceWord.getWord().trim().toLowerCase();
            if (vocabWordRepository.existsBySetIdAndWordIgnoreCaseAndStatus(
                    targetSet.getId(),
                    normalizedWord,
                    ContentStatus.PUBLISHED)) {
                continue;
            }
            VocabWord targetWord = new VocabWord();
            targetWord.setSet(targetSet);
            targetWord.setWord(normalizedWord);
            targetWord.setMeaning(sourceWord.getMeaning());
            targetWord.setPartOfSpeech(cleanOptional(sourceWord.getPartOfSpeech()));
            targetWord.setPhonetic(cleanOptional(sourceWord.getPhonetic()));
            targetWord.setExample(exampleForWord(sourceWord));
            targetWord.setAudioUrl(cleanOptional(sourceWord.getAudioUrl()));
            targetWord.setStatus(ContentStatus.PUBLISHED);
            targetWord.setSourceType(SourceType.COMMUNITY);
            targetWord.setSourceNote("Copied from community vocabulary set " + sourceSet.getId() + ".");
            targetWord.setLicenseNote(cleanOptional(sourceWord.getLicenseNote()));
            Instant now = Instant.now();
            targetWord.setPublishedAt(now);
            targetWord.setUpdatedAt(now);
            vocabWordRepository.save(targetWord);
            copied++;
        }
        targetSet.setUpdatedAt(Instant.now());
        return copied;
    }

    private boolean matchesMastery(VocabWord word, Map<Long, UserVocabProgress> progressByWordId, String mastery, Instant now) {
        if ("all".equals(mastery)) {
            return true;
        }
        UserVocabProgress progress = progressByWordId.get(word.getId());
        if ("due".equals(mastery)) {
            return progress != null
                    && progress.getNextReviewAt() != null
                    && !progress.getNextReviewAt().isAfter(now);
        }
        boolean mastered = progress != null && progress.getStatus() == VocabProgressStatus.MASTERED;
        return "mastered".equals(mastery) ? mastered : !mastered;
    }

    private void assertSetAccessible(VocabSet set, Long userId) {
        if (set.getCreatedBy() == null) {
            return;
        }
        if (set.getFolder() != null && set.getFolder().isPublicShared()) {
            return;
        }
        if (userId == null || !set.getCreatedBy().getId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found");
        }
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
        return cleaned == null || cleaned.length() > 8 ? "⭐" : cleaned;
    }

    private User requireUser(Long userId) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
    }

    private String cleanOptional(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private List<String> excludeExistingWords(List<String> suggestedWords, List<String> existingWords, int limit) {
        List<String> existing = existingWords == null ? List.of() : existingWords.stream()
                .filter(StringUtils::hasText)
                .map(word -> word.trim().toLowerCase())
                .toList();
        List<String> filteredWords = new java.util.ArrayList<>();
        if (suggestedWords == null) {
            return filteredWords;
        }
        for (String suggestedWord : suggestedWords) {
            if (!StringUtils.hasText(suggestedWord)) {
                continue;
            }
            String normalized = suggestedWord.trim().toLowerCase();
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
        String word = rawWord.trim().toLowerCase();
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
        String lower = trimmed.toLowerCase();
        if (lower.startsWith("a ") || lower.startsWith("an ") || lower.startsWith("the act of ")
                || lower.startsWith("one who ") || lower.startsWith("important types ")) {
            return false;
        }
        return trimmed.matches("(?is).*\\b" + java.util.regex.Pattern.quote(word.toLowerCase()) + "\\b.*")
                && (trimmed.endsWith(".") || trimmed.endsWith("?") || trimmed.endsWith("!"));
    }
}
