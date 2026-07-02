(function () {
    const page = document.querySelector(".listen-practice-page");
    if (!page) {
        return;
    }

    const state = {
        part: Number(page.dataset.part || 1),
        level: Number(page.dataset.level || 1),
        mode: page.dataset.mode || "normal",
        assist: Number(page.dataset.assist || 30),
        replayCount: 0,
        auto: false
    };

    document.querySelectorAll(".practice-mode-panel[data-hidden-text]").forEach(setupHiddenWords);
    document.querySelectorAll(".practice-question").forEach(setupAnswerProgress);
    document.querySelectorAll(".practice-audio-card").forEach(setupAudioCard);
    document.querySelectorAll(".favorite-button").forEach(setupFavoriteButton);
    document.querySelectorAll(".practice-note-panel").forEach(setupNotePanel);
    document.querySelectorAll(".practice-vocab-panel").forEach(setupVocabPanel);
    setupPanelToggles();
    setupAutoToggle();
    setupKeyboardShortcuts();

    function setupAnswerProgress(question) {
        const correctAnswer = normalizeAnswer(question.dataset.correctAnswer);
        const feedback = question.querySelector(".listening-answer-feedback");
        question.querySelectorAll("input[type='radio']").forEach((input) => {
            input.addEventListener("change", () => {
                const selectedAnswer = normalizeAnswer(input.value);
                const correct = selectedAnswer === correctAnswer;
                question.classList.toggle("is-correct", correct);
                question.classList.toggle("is-wrong", !correct);
                if (feedback) {
                    feedback.textContent = correct ? "Đúng" : `Chưa đúng. Đáp án đúng: ${correctAnswer}`;
                }
                saveProgress(question, selectedAnswer, correctAnswer);
                if (correct && state.auto) {
                    moveToNextItem(question);
                }
            });
        });
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

    function setupHiddenWords(panel) {
        const output = panel.querySelector(".hidden-word-output");
        if (!output) {
            return;
        }
        const mode = panel.dataset.mode;
        const percent = Number(panel.dataset.percent || 30);
        const tokens = tokenize(toText(panel.dataset.hiddenText || ""));
        const hiddenIndexes = chooseHiddenIndexes(tokens, percent);
        const hiddenSet = new Set(hiddenIndexes);
        const revealed = new Set();

        render();

        panel.querySelectorAll("[data-action]").forEach((button) => {
            button.addEventListener("click", () => {
                const action = button.dataset.action;
                if (action === "reveal-all") {
                    hiddenIndexes.forEach((index) => revealed.add(index));
                } else if (action === "flip-three") {
                    revealNext(3);
                } else {
                    revealNext(1);
                }
                render();
            });
        });

        output.addEventListener("keydown", (event) => {
            if (mode !== "fill" || event.key !== "Enter") {
                return;
            }
            const input = event.target.closest("input[data-answer]");
            if (!input) {
                return;
            }
            event.preventDefault();
            checkInput(input);
        });

        output.addEventListener("input", (event) => {
            const input = event.target.closest("input[data-answer]");
            if (input) {
                checkInput(input);
            }
        });

        function revealNext(count) {
            hiddenIndexes
                .filter((index) => !revealed.has(index))
                .slice(0, count)
                .forEach((index) => revealed.add(index));
        }

        function render() {
            output.replaceChildren();
            tokens.forEach((token, index) => {
                if (token.type === "space") {
                    output.append(document.createTextNode(token.value));
                    return;
                }
                if (!hiddenSet.has(index) || revealed.has(index)) {
                    output.append(document.createTextNode(token.value));
                    return;
                }
                if (mode === "fill") {
                    const input = document.createElement("input");
                    input.className = "hidden-word-input";
                    input.type = "text";
                    input.autocomplete = "off";
                    input.spellcheck = false;
                    input.dataset.answer = token.value;
                    input.style.width = `${Math.max(48, token.value.length * 12)}px`;
                    input.setAttribute("aria-label", "Điền từ còn thiếu");
                    output.append(input);
                } else {
                    const button = document.createElement("button");
                    button.className = "hidden-word-chip";
                    button.type = "button";
                    button.textContent = "•".repeat(Math.max(3, Math.min(token.value.length, 10)));
                    button.addEventListener("click", () => {
                        revealed.add(index);
                        render();
                    });
                    output.append(button);
                }
            });
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
            .filter(({token}) => token.type === "word" && normalizeWord(token.value).length > 3);
        const count = Math.max(1, Math.round(eligible.length * (percent / 100)));
        return eligible
            .sort((left, right) => scoreWord(right.token.value) - scoreWord(left.token.value))
            .slice(0, count)
            .map(({index}) => index)
            .sort((left, right) => left - right);
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
                document.querySelectorAll(`.practice-tool-panel[data-tool-panel='${target}']`).forEach((panel) => {
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
                const button = document.querySelector("[data-action='flip-next'], [data-action='hint']");
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
        return (item && item.querySelector(".hidden-word-output, .practice-support p")?.textContent || "").trim().slice(0, 1000);
    }

    function moveToNextItem(question) {
        const item = question.closest(".practice-item");
        const next = item && item.nextElementSibling;
        if (!next) {
            return;
        }
        window.setTimeout(() => {
            next.scrollIntoView({behavior: "smooth", block: "start"});
            const audio = next.querySelector("audio");
            if (audio) {
                audio.play().catch(() => {});
            }
        }, 450);
    }

    function currentAudio() {
        const midpoint = window.scrollY + window.innerHeight / 2;
        const cards = Array.from(document.querySelectorAll(".practice-audio-card"));
        if (cards.length === 0) {
            return null;
        }
        const card = cards
            .map((candidate) => ({candidate, distance: Math.abs(candidate.getBoundingClientRect().top + window.scrollY - midpoint)}))
            .sort((left, right) => left.distance - right.distance)[0].candidate;
        return card.querySelector("audio");
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

    function isTypingTarget(target) {
        return target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    }

    function scoreWord(word) {
        const normalized = normalizeWord(word);
        const suffixBoost = /(ing|tion|ment|able|ive|ous|ed|ly)$/.test(normalized) ? 3 : 0;
        return normalized.length + suffixBoost;
    }

    function tokenize(text) {
        const matches = text.match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\s+|./g) || [];
        return matches.map((value) => ({
            value,
            type: /^\s+$/.test(value) ? "space" : /^[A-Za-z]+(?:['-][A-Za-z]+)?$/.test(value) ? "word" : "punct"
        }));
    }

    function toText(value) {
        const element = document.createElement("div");
        element.innerHTML = value;
        return (element.textContent || element.innerText || value).trim();
    }

    function normalizeWord(value) {
        return (value || "").trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
    }

    function normalizeAnswer(value) {
        return (value || "").trim().toUpperCase();
    }
})();
