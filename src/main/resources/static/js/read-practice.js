(function () {
    const page = document.querySelector(".read-practice-page");
    if (!page) {
        return;
    }

    const items = Array.from(document.querySelectorAll(".practice-item"));
    const state = {
        part: Number(page.dataset.part || 5),
        level: Number(page.dataset.level || 1),
        mode: normalizeMode(page.dataset.mode),
        assist: 0,
        startedAt: Date.now(),
        auto: false,
        currentIndex: 0
    };

    setupNavigation();
    document.querySelectorAll(".practice-question").forEach(setupQuestionMode);
    document.querySelectorAll(".practice-question").forEach(setupAnswerFeedback);
    document.querySelectorAll(".favorite-button").forEach(setupFavoriteButton);
    document.querySelectorAll(".practice-note-panel").forEach(setupNotePanel);
    document.querySelectorAll(".practice-vocab-panel").forEach(setupVocabPanel);
    setupPanelToggles();
    setupAutoToggle();
    setupElapsedTimer();
    setupKeyboardShortcuts();

    function setupNavigation() {
        activateItem(initialItemIndex(), {scroll: false});
        document.querySelector("[data-practice-prev]")?.addEventListener("click", () => activateItem(state.currentIndex - 1));
        document.querySelector("[data-practice-next]")?.addEventListener("click", () => activateItem(state.currentIndex + 1));
    }

    function initialItemIndex() {
        const value = Number.parseInt(new URLSearchParams(window.location.search).get("q") || "0", 10);
        return Number.isNaN(value) ? 0 : value;
    }

    function activateItem(index, options = {}) {
        if (items.length === 0) {
            return;
        }
        state.currentIndex = Math.max(0, Math.min(items.length - 1, index));
        items.forEach((item, itemIndex) => item.classList.toggle("is-active", itemIndex === state.currentIndex));
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
        syncCurrentItemParam();
    }

    function syncCurrentItemParam() {
        document.querySelectorAll(".practice-tools a").forEach((link) => {
            try {
                const url = new URL(link.getAttribute("href"), window.location.origin);
                url.searchParams.set("q", String(state.currentIndex));
                link.setAttribute("href", url.pathname + url.search);
            } catch (error) {
                // Keep the original href if it cannot be parsed.
            }
        });
        const qField = document.querySelector("[data-q-field]");
        if (qField) {
            qField.value = String(state.currentIndex);
        }
    }

    function setupQuestionMode(question) {
        if (state.mode === "bilingual") {
            setupBilingualAnswers(question);
        }
    }

    function setupBilingualAnswers(question) {
        const translations = parseOptionTranslations(firstText(
                question.dataset.answerTranslation,
                question.dataset.questionTranslation));
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

    function setupAnswerFeedback(question) {
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
                    feedback.textContent = correct ? "Dung" : `Chua dung. Dap an dung: ${correctAnswer}`;
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
        setPanelText(panel, "[data-solution-result]", null, correct
                ? `Ban chon ${selectedAnswer}. Dap an dung.`
                : `Ban chon ${selectedAnswer}. Dap an dung la ${correctAnswer}.`);
        setPanelText(panel, "[data-solution-explanation]", "[data-solution-explanation-wrap]", question.dataset.explanation);
        setPanelText(panel, "[data-solution-translation]", "[data-solution-translation-wrap]", question.dataset.questionTranslation);
        setPanelText(panel, "[data-solution-answer]", "[data-solution-answer-wrap]", question.dataset.answerTranslation);
        setPanelText(panel, "[data-solution-vocabulary]", "[data-solution-vocabulary-wrap]", question.dataset.vocabulary);
        panel.hidden = false;
    }

    function setPanelText(panel, textSelector, wrapSelector, value) {
        const text = panel.querySelector(textSelector);
        const wrap = wrapSelector ? panel.querySelector(wrapSelector) : null;
        const content = firstText(value);
        if (text) {
            text.textContent = content;
        }
        if (wrap) {
            wrap.hidden = !content;
        }
    }

    async function saveProgress(question, selectedAnswer, correctAnswer) {
        try {
            const response = await fetch("/api/reading/progress", {
                method: "POST",
                keepalive: true,
                credentials: "same-origin",
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
                    elapsedSeconds: Math.max(0, Math.round((Date.now() - state.startedAt) / 1000))
                })
            });
            if (!response.ok) {
                console.warn("Reading progress save returned", response.status);
                return;
            }
            const payload = await response.json();
            if (payload && payload.data && payload.data.saved === false) {
                console.warn("Reading progress not saved per server response", payload);
            }
        } catch (error) {
            console.warn("Reading progress was not saved", error);
        }
    }

    function setupFavoriteButton(button) {
        button.addEventListener("click", async () => {
            button.disabled = true;
            const payload = await postTool("/api/reading/favorites", {
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
            const payload = await postTool("/api/reading/notes", {
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
            const payload = await postTool("/api/reading/vocab-basket", {
                itemId: form.dataset.itemId,
                questionId: form.dataset.questionId,
                word: form.elements.word.value,
                meaning: form.elements.meaning.value,
                example: currentReadingSnippet(form)
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

    async function postTool(url, body) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body)
            });
            return await response.json();
        } catch (error) {
            return {data: {saved: false, message: "Khong luu duoc."}};
        }
    }

    function showStatus(element, payload) {
        if (!element) {
            return;
        }
        element.textContent = payload && payload.data && payload.data.message ? payload.data.message : "Da xu ly.";
        element.classList.toggle("is-success", Boolean(payload && payload.data && payload.data.saved));
    }

    function currentReadingSnippet(form) {
        const item = form.closest(".practice-item");
        return (item && item.querySelector(".practice-reading-stem, .learning-passage, .answer-option-text")?.textContent || "").trim().slice(0, 1000);
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

    function setupElapsedTimer() {
        const target = document.querySelector("[data-elapsed-time]");
        if (!target) {
            return;
        }
        const update = () => {
            const seconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            target.textContent = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
        };
        update();
        window.setInterval(update, 1000);
    }

    function setupKeyboardShortcuts() {
        document.addEventListener("keydown", (event) => {
            if (isTypingTarget(event.target)) {
                return;
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                activateItem(state.currentIndex - 1);
                return;
            }
            if (event.key === "ArrowRight") {
                event.preventDefault();
                activateItem(state.currentIndex + 1);
                return;
            }
            const answerMap = {1: "A", 2: "B", 3: "C", 4: "D"};
            const answer = answerMap[event.key];
            if (answer) {
                const input = currentItem().querySelector(`label[data-answer-option='${answer}'] input`);
                if (input) {
                    input.checked = true;
                    input.dispatchEvent(new Event("change", {bubbles: true}));
                }
            }
        });
    }

    function moveToNextItem() {
        if (state.currentIndex >= items.length - 1) {
            return;
        }
        window.setTimeout(() => activateItem(state.currentIndex + 1), 450);
    }

    function currentItem() {
        return items[state.currentIndex] || document;
    }

    function parseOptionTranslations(text) {
        const result = {};
        if (!text) {
            return result;
        }
        text.replace(/\r/g, "\n")
            .split(/\n+|(?=\([A-D]\))/g)
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => {
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

    function firstText(...values) {
        const value = values.find((candidate) => candidate && String(candidate).trim().length > 0);
        return value == null ? "" : String(value).trim();
    }

    function normalizeAnswer(value) {
        return (value || "").trim().toUpperCase();
    }

    function normalizeMode(value) {
        return value === "bilingual" ? value : "normal";
    }
})();
