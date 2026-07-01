(function () {
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

    document.querySelectorAll("[data-logout-button]").forEach(bindLogout);
})();
