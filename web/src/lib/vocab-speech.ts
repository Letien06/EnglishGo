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
