/**
 * Vocabulary examples can include a Vietnamese translation in a trailing
 * parenthesis or on the following line. Keep only the English sentence for TTS.
 */
export function englishExampleForSpeech(value: string): string {
  const [firstLine = ""] = value.trim().split(/\r?\n/, 1);

  return firstLine
    .replace(/\s*\((?=[^)]*[À-ỹĐđ])[^)]*\)\s*$/u, "")
    .replace(/\s+[—–-]\s*(?=.*[À-ỹĐđ]).*$/u, "")
    .trim();
}

/**
 * Find the highest-quality native English voice available in the browser.
 * Prevents mobile devices (iOS / iPadOS / Android) from defaulting to the
 * system language voice (e.g. Vietnamese Google TTS / Chị Google) when pronouncing English.
 */
export function findBestEnglishVoice(accent: "us" | "uk" = "us"): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices?.();
  if (!voices || !Array.isArray(voices) || voices.length === 0) return null;

  // Filter only valid English voices (strictly exclude Vietnamese or other languages)
  const englishVoices = voices.filter(
    (v) => v.lang && v.lang.toLowerCase().startsWith("en")
  );
  if (englishVoices.length === 0) return null;

  const targetLang = accent === "uk" ? "en-gb" : "en-us";

  // Preferred high-quality / natural voices across iOS, macOS, Windows, Android
  const preferredNames =
    accent === "uk"
      ? [
          "Daniel",
          "Oliver",
          "George",
          "Hazel",
          "Serena",
          "Libby",
          "Sonia",
          "Google UK English Female",
          "Google UK English Male",
        ]
      : [
          "Ava",
          "Samantha",
          "Jenny",
          "Guy",
          "Aria",
          "Zoe",
          "Allison",
          "Nicky",
          "Google US English",
          "Natural",
          "Premium",
          "Enhanced",
        ];

  // 1. Try finding a preferred voice matching the target accent (e.g. Samantha on iOS/iPadOS, Jenny on Windows)
  for (const name of preferredNames) {
    const found = englishVoices.find(
      (v) =>
        v.lang.toLowerCase().replace("_", "-").startsWith(targetLang) &&
        v.name.toLowerCase().includes(name.toLowerCase())
    );
    if (found) return found;
  }

  // 2. Try finding any preferred voice in English
  for (const name of preferredNames) {
    const found = englishVoices.find((v) =>
      v.name.toLowerCase().includes(name.toLowerCase())
    );
    if (found) return found;
  }

  // 3. Try finding any voice matching exact target accent (e.g. en-US or en-GB)
  const exactAccent = englishVoices.find((v) =>
    v.lang.toLowerCase().replace("_", "-").startsWith(targetLang)
  );
  if (exactAccent) return exactAccent;

  // 4. Fallback to any available English voice
  return englishVoices[0];
}
