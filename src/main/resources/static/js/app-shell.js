(function () {
    const themeKey = "englishgo-theme";

    function readStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {}
    }

    function preferredTheme() {
        const saved = readStorage(themeKey);
        if (saved === "dark" || saved === "light") {
            return saved;
        }
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    function applyTheme(theme) {
        const dark = theme === "dark";
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        document.querySelectorAll(".theme-button").forEach(button => {
            button.textContent = dark ? "☀" : "☾";
            button.setAttribute("aria-pressed", String(dark));
            button.setAttribute("title", dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
        });
    }

    applyTheme(preferredTheme());

    function bindTheme(button) {
        button.addEventListener("click", function () {
            const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
            writeStorage(themeKey, next);
            applyTheme(next);
        });
    }

    function markStudySaved() {
        const today = new Date().toISOString().slice(0, 10);
        const lastSavedDay = readStorage("englishgo-last-study-date");
        document.querySelectorAll("[data-streak-count]").forEach(item => {
            const current = Number.parseInt(item.textContent || "0", 10) || 0;
            if (lastSavedDay !== today) {
                item.textContent = String(Math.max(1, current + 1));
            }
        });
        writeStorage("englishgo-last-study-date", today);
    }

    function bindLogout(button) {
        button.addEventListener("click", async function () {
            button.disabled = true;
            try {
                await fetch("/auth/logout", {method: "POST"});
            } finally {
                window.location.href = "/login";
            }
        });
    }

    document.querySelectorAll(".theme-button").forEach(bindTheme);
    document.querySelectorAll("[data-logout-button]").forEach(bindLogout);
    document.addEventListener("englishgo:study-saved", markStudySaved);
})();
