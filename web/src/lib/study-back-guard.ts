// Keep the router's history payload intact while a save dialog is open.
const MARKER = "englishgoStudyGuard";
type Marker = { url: string; entry: "base" | "top" };

export function installStudyBackGuard(onBack: () => void) {
  const url = window.location.href;
  let leaving: (() => void) | undefined;
  const state = window.history.state ?? {};
  const existing = state[MARKER] as Marker | undefined;
  const base = { ...state, [MARKER]: { url, entry: "base" } };
  const top = { ...state, [MARKER]: { url, entry: "top" } };
  if (existing?.url !== url || existing.entry !== "top") {
    window.history.replaceState(base, "", url);
    window.history.pushState(top, "", url);
  }

  const onPopState = (event: PopStateEvent) => {
    const marker = event.state?.[MARKER] as Marker | undefined;
    if (marker?.url !== url || marker.entry !== "base") return;
    // Capture before Next processes the same-URL traversal and restores its tree.
    event.stopImmediatePropagation();
    if (leaving) {
      const navigate = leaving;
      leaving = undefined;
      const clean = { ...event.state };
      delete clean[MARKER];
      window.history.replaceState(clean, "", url);
      navigate();
    } else {
      window.history.pushState(top, "", url);
      onBack();
    }
  };
  window.addEventListener("popstate", onPopState, true);
  return {
    leave(navigate: () => void) {
      if (leaving) return;
      const marker = window.history.state?.[MARKER] as Marker | undefined;
      if (marker?.url === url && marker.entry === "top") {
        leaving = navigate;
        window.history.back();
      } else navigate();
    },
    dispose() { window.removeEventListener("popstate", onPopState, true); },
  };
}
