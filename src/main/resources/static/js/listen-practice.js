(function () {
    const page = document.querySelector(".listen-practice-page");
    if (!page) {
        return;
    }

    const items = Array.from(document.querySelectorAll(".practice-item"));
    const state = {
        part: Number(page.dataset.part || 1),
        level: Number(page.dataset.level || 1),
        mode: page.dataset.mode || "normal",
        assist: Number(page.dataset.assist || 30),
        replayCount: 0,
        auto: false,
        currentIndex: 0
    };

    setupSingleItemNavigation();
    document.querySelectorAll(".practice-question").forEach(setupQuestionMode);
    document.querySelectorAll(".practice-question").forEach(setupAnswerProgress);
    document.querySelectorAll(".practice-audio-card").forEach(setupAudioCard);
    document.querySelectorAll(".favorite-button").forEach(setupFavoriteButton);
    document.querySelectorAll(".practice-note-panel").forEach(setupNotePanel);
    document.querySelectorAll(".practice-vocab-panel").forEach(setupVocabPanel);
    setupPanelToggles();
    setupAutoToggle();
    setupKeyboardShortcuts();

    function setupSingleItemNavigation() {
        activateItem(0, {scroll: false});
        document.querySelector("[data-practice-prev]")?.addEventListener("click", () => activateItem(state.currentIndex - 1));
        document.querySelector("[data-practice-next]")?.addEventListener("click", () => activateItem(state.currentIndex + 1));
    }

    function activateItem(index, options = {}) {
        if (items.length === 0) {
            return;
        }
        const nextIndex = Math.max(0, Math.min(items.length - 1, index));
        pauseAudios(items[state.currentIndex]);
        state.currentIndex = nextIndex;
        items.forEach((item, itemIndex) => {
            item.classList.toggle("is-active", itemIndex === state.currentIndex);
        });
        updateNavigation();
        if (options.scroll !== false) {
            window.scrollTo({top: 0, behavior: "smooth"});
        }
    }

    function updateNavigation() {
        const counter = document.querySelector("[data-practice-counter]");
        const prev = document.querySelector("[data-practice-prev]");
        const next = document.querySelector("[data-practice-next]");
        if (counter) {
            counter.textContent = `${state.currentIndex + 1}/${items.length}`;
        }
        if (prev) {
            prev.disabled = state.currentIndex === 0;
        }
        if (next) {
            next.disabled = state.currentIndex >= items.length - 1;
        }
    }

    function setupQuestionMode(question) {
        if (state.mode === "bilingual") {
            setupBilingualAnswers(question);
        }
        if (state.mode !== "fill" && state.mode !== "flip") {
            return;
        }
        question.classList.add(`uses-${state.mode}`);
        question.querySelectorAll(".answer-option-text").forEach((span) => setupMaskedAnswer(span, state.mode));
        setupInlineModeTools(question);
    }

    function setupBilingualAnswers(question) {
        const item = question.closest(".practice-item");
        const translations = parseOptionTranslations(
                firstText(question.dataset.answerTranslation, question.dataset.questionTranslation, item?.dataset.translation));
        Object.entries(translations).forEach(([option, translation]) => {
            const label = question.querySelector(`label[data-answer-option='${option}']`);
            if (!label || !translation) {
                return;
            }
            const text = document.createElement("small");
            text.className = "answer-option-translation";
            text.textContent = translation;
            label.append(text);
        });
    }

    function setupMaskedAnswer(span, mode) {
        const tokens = tokenize(span.dataset.originalText || span.textContent || "");
        const hiddenIndexes = chooseHiddenIndexes(tokens, state.assist);
        span._maskState = {
            mode,
            tokens,
            hiddenIndexes,
            revealed: new Set()
        };
        renderMaskedAnswer(span);
    }

    function setupInlineModeTools(question) {
        question.querySelectorAll("[data-action]").forEach((button) => {
            button.addEventListener("click", () => {
                const action = button.dataset.action;
                if (action === "reveal-all") {
                    revealAll(question);
                } else if (action === "flip-three") {
                    revealNextWords(question, 3);
                } else {
                    revealNextWords(question, 1);
                }
            });
        });

        question.addEventListener("keydown", (event) => {
            if (state.mode !== "fill" || event.key !== "Enter") {
                return;
            }
            const input = event.target.closest("input[data-answer]");
            if (!input) {
                return;
            }
            event.preventDefault();
            checkInput(input);
        });

        question.addEventListener("input", (event) => {
            const input = event.target.closest("input[data-answer]");
            if (input) {
                checkInput(input);
            }
        });
    }

    function revealNextWords(question, count) {
        let remaining = count;
        question.querySelectorAll(".answer-option-text").forEach((span) => {
            if (remaining <= 0 || !span._maskState) {
                return;
            }
            const stateForSpan = span._maskState;
            stateForSpan.hiddenIndexes
                .filter((index) => !stateForSpan.revealed.has(index))
                .slice(0, remaining)
                .forEach((index) => {
                    stateForSpan.revealed.add(index);
                    remaining -= 1;
                });
            renderMaskedAnswer(span);
        });
    }

    function revealAll(question) {
        question.querySelectorAll(".answer-option-text").forEach((span) => {
            if (!span._maskState) {
                return;
            }
            span._maskState.hiddenIndexes.forEach((index) => span._maskState.revealed.add(index));
            renderMaskedAnswer(span);
        });
    }

    function renderMaskedAnswer(span) {
        const mask = span._maskState;
        if (!mask) {
            return;
        }
        const hiddenSet = new Set(mask.hiddenIndexes);
        span.replaceChildren();
        mask.tokens.forEach((token, index) => {
            if (token.type === "space") {
                span.append(document.createTextNode(token.value));
                return;
            }
            if (!hiddenSet.has(index)) {
                span.append(document.createTextNode(token.value));
                return;
            }
            if (mask.revealed.has(index)) {
                if (mask.mode === "flip") {
                    const revealed = document.createElement("span");
                    revealed.className = "hidden-word-revealed";
                    revealed.textContent = token.value;
                    span.append(revealed);
                } else {
                    span.append(document.createTextNode(token.value));
                }
                return;
            }
            if (mask.mode === "fill") {
                const input = document.createElement("input");
                input.className = "hidden-word-input";
                input.type = "text";
                input.autocomplete = "off";
                input.spellcheck = false;
                input.dataset.answer = token.value;
                input.style.width = `${Math.max(48, token.value.length * 12)}px`;
                input.setAttribute("aria-label", "Điền từ còn thiếu");
                input.addEventListener("click", (event) => event.stopPropagation());
                span.append(input);
                return;
            }
            const chip = document.createElement("span");
            chip.className = "hidden-word-chip";
            chip.tabIndex = 0;
            chip.role = "button";
            chip.textContent = "•".repeat(Math.max(3, Math.min(token.value.length, 10)));
            chip.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                mask.revealed.add(index);
                renderMaskedAnswer(span);
            });
            chip.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                    return;
                }
                event.preventDefault();
                mask.revealed.add(index);
                renderMaskedAnswer(span);
            });
            span.append(chip);
        });
    }

    function setupAnswerProgress(question) {
        const correctAnswer = normalizeAnswer(question.dataset.correctAnswer);
        const feedback = question.querySelector(".listening-answer-feedback");
        question.querySelectorAll("input[type='radio']").forEach((input) => {
            input.addEventListener("change", () => {
                const selectedAnswer = normalizeAnswer(input.value);
                const correct = selectedAnswer === correctAnswer;
                markAnswerLabels(question, selectedAnswer, correctAnswer);
                question.classList.toggle("is-correct", correct);
                question.classList.toggle("is-wrong", !correct);
                if (feedback) {
                    feedback.textContent = correct ? "Đúng" : `Chưa đúng. Đáp án đúng: ${correctAnswer}`;
                }
                showSolution(question, selectedAnswer, correctAnswer, correct);
                saveProgress(question, selectedAnswer, correctAnswer);
                if (correct && state.auto) {
                    moveToNextItem();
                }
            });
        });
    }

    function markAnswerLabels(question, selectedAnswer, correctAnswer) {
        question.querySelectorAll("label[data-answer-option]").forEach((label) => {
            const option = normalizeAnswer(label.dataset.answerOption);
            label.classList.toggle("is-selected", option === selectedAnswer);
            label.classList.toggle("is-correct-choice", option === correctAnswer);
            label.classList.toggle("is-wrong-choice", option === selectedAnswer && option !== correctAnswer);
        });
    }

    function showSolution(question, selectedAnswer, correctAnswer, correct) {
        const panel = question.querySelector(".practice-solution-panel");
        if (!panel) {
            return;
        }
        const item = question.closest(".practice-item");
        const result = panel.querySelector("[data-solution-result]");
        const translationWrap = panel.querySelector("[data-solution-translation-wrap]");
        const translationText = panel.querySelector("[data-solution-translation]");
        const vocabularyWrap = panel.querySelector("[data-solution-vocabulary-wrap]");
        const vocabularyText = panel.querySelector("[data-solution-vocabulary]");
        panel.hidden = false;
        if (result) {
            result.textContent = correct
                    ? `Bạn chọn ${selectedAnswer}. Đáp án đúng.`
                    : `Bạn chọn ${selectedAnswer}. Đáp án đúng là ${correctAnswer}.`;
        }
        const translation = firstText(question.dataset.answerTranslation, question.dataset.questionTranslation, item?.dataset.translation);
        if (translationWrap && translationText) {
            translationWrap.hidden = !translation;
            translationText.textContent = translation || "";
        }
        const vocabulary = firstText(question.dataset.vocabulary, item?.dataset.vocabulary);
        if (vocabularyWrap && vocabularyText) {
            vocabularyWrap.hidden = !vocabulary;
            vocabularyText.textContent = vocabulary || "";
        }
    }

    async function saveProgress(question, selectedAnswer, correctAnswer) {
        try {
            await fetch("/api/listening/progress", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    part: state.part,
                    level: state.level,
                    itemId: question.dataset.itemId,
                    questionId: question.dataset.questionId,
                    selectedAnswer,
                    correctAnswer,
                    modeUsed: state.mode,
                    assistPercent: state.assist,
                    replayCount: state.replayCount
                })
            });
        } catch (error) {
            console.warn("Listening progress was not saved", error);
        }
    }

    function checkInput(input) {
        const expected = normalizeWord(input.dataset.answer);
        const actual = normalizeWord(input.value);
        input.classList.toggle("is-correct", actual.length > 0 && actual === expected);
        input.classList.toggle("is-wrong", actual.length > 0 && actual !== expected);
    }

    function chooseHiddenIndexes(tokens, percent) {
        const eligible = tokens
            .map((token, index) => ({token, index}))
            .filter(({token}) => token.type === "word" && normalizeWord(token.value).length > 0);
        if (eligible.length === 0) {
            return [];
        }
        const count = Math.min(eligible.length, Math.max(1, Math.ceil(eligible.length * (percent / 100))));
        if (count >= eligible.length) {
            return eligible.map(({index}) => index);
        }
        if (count === 1) {
            return [[...eligible].sort((left, right) => scoreWord(right.token.value) - scoreWord(left.token.value))[0].index];
        }
        const selected = new Set();
        for (let step = 0; step < count; step += 1) {
            const position = Math.round(step * ((eligible.length - 1) / (count - 1)));
            selected.add(eligible[position].index);
        }
        for (const {index} of eligible) {
            if (selected.size >= count) {
                break;
            }
            selected.add(index);
        }
        return Array.from(selected).sort((left, right) => left - right);
    }

    function setupAudioCard(card) {
        const audio = card.querySelector("audio");
        const speedButton = card.querySelector("[data-audio-action='speed']");
        if (!audio) {
            return;
        }
        card.querySelectorAll("[data-audio-action]").forEach((button) => {
            button.addEventListener("click", () => {
                const action = button.dataset.audioAction;
                if (action === "back-3") {
                    rewind(audio, 3);
                } else if (action === "back-5") {
                    rewind(audio, 5);
                } else if (action === "speed") {
                    const nextRate = nextPlaybackRate(audio.playbackRate);
                    audio.playbackRate = nextRate;
                    button.textContent = `${nextRate}x`;
                }
            });
        });
        audio.addEventListener("ratechange", () => {
            if (speedButton) {
                speedButton.textContent = `${audio.playbackRate}x`;
            }
        });
    }

    function setupFavoriteButton(button) {
        button.addEventListener("click", async () => {
            button.disabled = true;
            const payload = await postTool("/api/listening/favorites", {
                part: state.part,
                level: state.level,
                itemId: button.dataset.itemId,
                questionId: button.dataset.questionId
            });
            if (payload && payload.data) {
                button.classList.toggle("is-active", payload.data.favorite === true);
                button.textContent = payload.data.favorite === true ? "★" : "☆";
                button.title = payload.data.message || "";
            }
            button.disabled = false;
        });
    }

    function setupNotePanel(form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const status = form.querySelector("small");
            const payload = await postTool("/api/listening/notes", {
                itemId: form.dataset.itemId,
                questionId: form.dataset.questionId,
                note: form.elements.note.value
            });
            showStatus(status, payload);
        });
    }

    function setupVocabPanel(form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const status = form.querySelector("small");
            const payload = await postTool("/api/listening/vocab-basket", {
                itemId: form.dataset.itemId,
                questionId: form.dataset.questionId,
                word: form.elements.word.value,
                meaning: form.elements.meaning.value,
                example: currentTranscriptSnippet(form)
            });
            showStatus(status, payload);
            if (payload && payload.data && payload.data.saved) {
                form.elements.word.value = "";
                form.elements.meaning.value = "";
            }
        });
    }

    function setupPanelToggles() {
        document.querySelectorAll("[data-panel-target]").forEach((button) => {
            button.addEventListener("click", () => {
                const target = button.dataset.panelTarget;
                currentItem().querySelectorAll(`.practice-tool-panel[data-tool-panel='${target}']`).forEach((panel) => {
                    panel.classList.toggle("is-open");
                });
            });
        });
    }

    function setupAutoToggle() {
        const button = document.querySelector("[data-auto-toggle]");
        if (!button) {
            return;
        }
        button.addEventListener("click", () => {
            state.auto = !state.auto;
            button.classList.toggle("is-active", state.auto);
        });
    }

    function setupKeyboardShortcuts() {
        document.addEventListener("keydown", (event) => {
            if (isTypingTarget(event.target)) {
                return;
            }
            const audio = currentAudio();
            if (event.ctrlKey && audio) {
                event.preventDefault();
                if (audio.paused) {
                    audio.play().catch(() => {});
                } else {
                    audio.pause();
                }
            } else if (event.shiftKey && audio) {
                event.preventDefault();
                rewind(audio, 3);
            } else if (event.key === "Tab") {
                const button = currentItem().querySelector("[data-action='flip-next'], [data-action='hint']");
                if (button) {
                    event.preventDefault();
                    button.click();
                }
            }
        });
    }

    async function postTool(url, body) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body)
            });
            return await response.json();
        } catch (error) {
            return {data: {saved: false, message: "Không lưu được."}};
        }
    }

    function showStatus(element, payload) {
        if (!element) {
            return;
        }
        element.textContent = payload && payload.data && payload.data.message ? payload.data.message : "Đã xử lý.";
        element.classList.toggle("is-success", Boolean(payload && payload.data && payload.data.saved));
    }

    function currentTranscriptSnippet(form) {
        const item = form.closest(".practice-item");
        return (item && item.querySelector("[data-solution-translation], .answer-option-text")?.textContent || "").trim().slice(0, 1000);
    }

    function moveToNextItem() {
        if (state.currentIndex >= items.length - 1) {
            return;
        }
        window.setTimeout(() => {
            activateItem(state.currentIndex + 1);
            const audio = currentAudio();
            if (audio) {
                audio.play().catch(() => {});
            }
        }, 450);
    }

    function currentItem() {
        return items[state.currentIndex] || document;
    }

    function currentAudio() {
        return currentItem().querySelector(".practice-audio-card audio");
    }

    function pauseAudios(item) {
        item?.querySelectorAll("audio").forEach((audio) => audio.pause());
    }

    function rewind(audio, seconds) {
        audio.currentTime = Math.max(0, audio.currentTime - seconds);
        state.replayCount += 1;
    }

    function nextPlaybackRate(rate) {
        if (rate < 1) {
            return 1;
        }
        if (rate < 1.25) {
            return 1.25;
        }
        if (rate < 1.5) {
            return 1.5;
        }
        return 0.75;
    }

    function parseOptionTranslations(text) {
        const result = {};
        if (!text) {
            return result;
        }
        const parts = text
            .replace(/\r/g, "\n")
            .split(/\n+|(?=\([A-D]\))/g)
            .map((part) => part.trim())
            .filter(Boolean);
        parts.forEach((part) => {
            const match = part.match(/^\(?([A-D])\)?[\s.:-]*(.+)$/i);
            if (match) {
                result[match[1].toUpperCase()] = match[2].trim();
            }
        });
        return result;
    }

    function isTypingTarget(target) {
        return target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    }

    function scoreWord(word) {
        const normalized = normalizeWord(word);
        const suffixBoost = /(ing|tion|ment|able|ive|ous|ed|ly)$/.test(normalized) ? 3 : 0;
        return normalized.length + suffixBoost;
    }

    function tokenize(text) {
        const matches = text.match(/[A-Za-z]+(?:['’\\-][A-Za-z]+)?|\s+|./g) || [];
        return matches.map((value) => ({
            value,
            type: /^\s+$/.test(value) ? "space" : /^[A-Za-z]+(?:['’\\-][A-Za-z]+)?$/.test(value) ? "word" : "punct"
        }));
    }

    function firstText(...values) {
        const value = values.find((candidate) => candidate && String(candidate).trim().length > 0);
        return value == null ? "" : String(value).trim();
    }

    function normalizeWord(value) {
        return (value || "").trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
    }

    function normalizeAnswer(value) {
        return (value || "").trim().toUpperCase();
    }
})();
