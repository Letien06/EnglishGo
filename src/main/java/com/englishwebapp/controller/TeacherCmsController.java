package com.englishwebapp.controller;

import com.englishwebapp.entity.AnswerOption;
import com.englishwebapp.entity.ContentStatus;
import com.englishwebapp.entity.Lesson;
import com.englishwebapp.entity.Question;
import com.englishwebapp.entity.SourceType;
import com.englishwebapp.entity.Test;
import com.englishwebapp.entity.User;
import com.englishwebapp.entity.VocabSet;
import com.englishwebapp.entity.VocabWord;
import com.englishwebapp.repository.AnswerOptionRepository;
import com.englishwebapp.repository.LessonRepository;
import com.englishwebapp.repository.QuestionRepository;
import com.englishwebapp.repository.TestRepository;
import com.englishwebapp.repository.UserRepository;
import com.englishwebapp.repository.VocabSetRepository;
import com.englishwebapp.repository.VocabWordRepository;
import com.englishwebapp.security.AppUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;

@Controller
@RequiredArgsConstructor
public class TeacherCmsController {

    private final TestRepository testRepository;
    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final VocabSetRepository vocabSetRepository;
    private final VocabWordRepository vocabWordRepository;
    private final LessonRepository lessonRepository;
    private final UserRepository userRepository;

    @GetMapping("/teacher/cms")
    public String cms(Model model) {
        model.addAttribute("tests", testRepository.findAll(PageRequest.of(0, 20)).getContent());
        model.addAttribute("vocabSets", vocabSetRepository.findAll(PageRequest.of(0, 20)).getContent());
        model.addAttribute("lessons", lessonRepository.findAll(PageRequest.of(0, 20)).getContent());
        return "teacher/cms";
    }

    @PostMapping("/teacher/cms/tests")
    public String createTest(
            @AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam String title,
            @RequestParam String type,
            @RequestParam Integer duration,
            @RequestParam(required = false) String difficulty) {
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        Test test = new Test();
        test.setTitle(title);
        test.setType(type);
        test.setDuration(duration);
        test.setDifficulty(difficulty);
        test.setCreatedBy(user);
        test.setStatus(ContentStatus.PENDING_REVIEW);
        test.setSourceType(SourceType.COMMUNITY);
        test.setSourceNote("Submitted from teacher CMS.");
        testRepository.save(test);
        return "redirect:/teacher/cms";
    }

    @PostMapping("/teacher/cms/questions")
    public String createQuestion(
            @RequestParam Long testId,
            @RequestParam Integer part,
            @RequestParam String type,
            @RequestParam String content,
            @RequestParam(required = false) String audioUrl,
            @RequestParam(required = false) String imageUrl,
            @RequestParam(required = false) String explanation,
            @RequestParam(required = false) String optionA,
            @RequestParam(required = false) String optionB,
            @RequestParam(required = false) String optionC,
            @RequestParam(required = false) String optionD,
            @RequestParam(required = false, defaultValue = "A") String correctOption) {
        Test test = testRepository.findById(testId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Test not found"));
        Question question = new Question();
        question.setTest(test);
        question.setPart(part);
        question.setType(type);
        question.setContent(content);
        question.setAudioUrl(audioUrl);
        question.setImageUrl(imageUrl);
        question.setExplanation(explanation);
        question.setStatus(ContentStatus.PENDING_REVIEW);
        question.setSourceType(SourceType.COMMUNITY);
        question.setSourceNote("Submitted from teacher CMS.");
        Question savedQuestion = questionRepository.save(question);
        saveOption(savedQuestion, optionA, "A".equalsIgnoreCase(correctOption));
        saveOption(savedQuestion, optionB, "B".equalsIgnoreCase(correctOption));
        saveOption(savedQuestion, optionC, "C".equalsIgnoreCase(correctOption));
        saveOption(savedQuestion, optionD, "D".equalsIgnoreCase(correctOption));
        return "redirect:/teacher/cms";
    }

    @PostMapping("/teacher/cms/vocab-sets")
    public String createVocabSet(
            @RequestParam String title,
            @RequestParam String topic,
            @RequestParam(required = false) String level) {
        VocabSet set = new VocabSet();
        set.setTitle(title);
        set.setTopic(topic);
        set.setLevel(level);
        set.setStatus(ContentStatus.PENDING_REVIEW);
        set.setSourceType(SourceType.COMMUNITY);
        set.setSourceNote("Submitted from teacher CMS.");
        vocabSetRepository.save(set);
        return "redirect:/teacher/cms";
    }

    @PostMapping("/teacher/cms/vocab-words")
    public String createVocabWord(
            @RequestParam Long setId,
            @RequestParam String word,
            @RequestParam String meaning,
            @RequestParam(required = false) String phonetic,
            @RequestParam(required = false) String example,
            @RequestParam(required = false) String audioUrl) {
        VocabSet set = vocabSetRepository.findById(setId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vocabulary set not found"));
        VocabWord vocabWord = new VocabWord();
        vocabWord.setSet(set);
        vocabWord.setWord(word);
        vocabWord.setMeaning(meaning);
        vocabWord.setPhonetic(phonetic);
        vocabWord.setExample(example);
        vocabWord.setAudioUrl(audioUrl);
        vocabWord.setStatus(ContentStatus.PENDING_REVIEW);
        vocabWord.setSourceType(SourceType.COMMUNITY);
        vocabWord.setSourceNote("Submitted from teacher CMS.");
        vocabWordRepository.save(vocabWord);
        return "redirect:/teacher/cms";
    }

    @PostMapping("/teacher/cms/lessons")
    public String createLesson(
            @RequestParam String title,
            @RequestParam String topic,
            @RequestParam String content,
            @RequestParam(required = false) String videoUrl) {
        Lesson lesson = new Lesson();
        lesson.setTitle(title);
        lesson.setTopic(topic);
        lesson.setContent(content);
        lesson.setVideoUrl(videoUrl);
        lesson.setStatus(ContentStatus.PENDING_REVIEW);
        lesson.setSourceType(SourceType.COMMUNITY);
        lesson.setSourceNote("Submitted from teacher CMS.");
        lessonRepository.save(lesson);
        return "redirect:/teacher/cms";
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
}
