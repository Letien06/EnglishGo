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

    /* ── PERCEIVED-PERF: hover/focus prefetch for internal links ──
       Warm browser cache for the destination HTML the moment the user
       signals intent. On click the
       navigation is served from memory/disk cache and feels instant. */
    const prefetched = new Set();
    const prefetchExclude = /^(javascript:|mailto:|tel:|#|data:)/i;

    function isInternalLink(anchor) {
        if (!anchor || !anchor.href) return false;
        if (prefetchExclude.test(anchor.getAttribute("href") || "")) return false;
        if (anchor.hasAttribute("download")) return false;
        const target = anchor.getAttribute("target");
        if (target && target.toLowerCase() === "_blank") return false;
        if (anchor.hasAttribute("data-no-prefetch")) return false;
        let url;
        try { url = new URL(anchor.href, window.location.href); } catch (e) { return false; }
        if (url.origin !== window.location.origin) return false;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return false;
        if (anchor.pathname === "/auth/logout") return false;
        return true;
    }

    function prefetchPage(anchor) {
        if (!isInternalLink(anchor)) return;
        const url = anchor.href;
        if (prefetched.has(url)) return;
        prefetched.add(url);
        try {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.as = "document";
            link.href = url;
            link.crossOrigin = "same-origin";
            document.head.appendChild(link);
        } catch (e) { /* older browsers — ignore */ }
        try {
            fetch(url, {credentials: "same-origin", cache: "force-cache"})
                .catch(() => { /* best-effort */ });
        } catch (e) { /* ignore */ }
    }

    function bindPrefetch(anchor) {
        let armed = false;
        const arm = () => {
            if (armed) return;
            armed = true;
            if (typeof window.requestIdleCallback === "function") {
                window.requestIdleCallback(() => prefetchPage(anchor), {timeout: 600});
            } else {
                setTimeout(() => prefetchPage(anchor), 80);
            }
        };
        anchor.addEventListener("pointerenter", arm, {passive: true});
        anchor.addEventListener("focus", arm);
    }

    function scanPrefetch(root) {
        if (!root || !root.querySelectorAll) return;
        root.querySelectorAll('a[href]').forEach(bindPrefetch);
    }

    scanPrefetch(document);
    const prefetchObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.tagName === "A" && node.hasAttribute("href")) bindPrefetch(node);
                else if (node.querySelectorAll) scanPrefetch(node);
            }
        }
    });
    prefetchObserver.observe(document.documentElement, {childList: true, subtree: true});
})();
