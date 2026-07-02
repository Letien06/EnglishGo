(function () {
    document.querySelectorAll(".level-reset-button").forEach((button) => {
        button.addEventListener("click", async () => {
            const part = Number(button.dataset.part || 1);
            const level = Number(button.dataset.level || 1);
            button.disabled = true;
            const originalText = button.textContent;
            button.textContent = "...";
            try {
                const response = await fetch("/api/listening/reset", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({part, level})
                });
                const payload = await response.json();
                if (payload.data && payload.data.saved) {
                    window.location.reload();
                    return;
                }
                button.textContent = payload.data && payload.data.message ? payload.data.message : "Login";
            } catch (error) {
                button.textContent = "Loi";
            } finally {
                window.setTimeout(() => {
                    button.disabled = false;
                    button.textContent = originalText;
                }, 1800);
            }
        });
    });
})();
