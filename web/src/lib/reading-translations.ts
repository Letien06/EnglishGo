type ReadingOption = { key: string; text: string };

function normalizedWord(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

/** Parse source option labels or match glossary headwords to the actual options. */
export function parseReadingOptionTranslations(text: string, options: ReadingOption[]): Record<string, string> {
  const result: Record<string, string> = {};
  // A marker needs punctuation; ordinary sentences beginning with A/B/C/D are prose.
  const marker = /(?:^|\n|[ \t]+)(\([A-D]\)|[A-D][.):])\s*/g;
  const markers = [...text.matchAll(marker)];
  for (let index = 0; index < markers.length; index++) {
    const match = markers[index];
    const key = match[1].replace(/[^A-D]/g, "");
    const start = (match.index ?? 0) + match[0].length;
    const end = markers[index + 1]?.index ?? text.length;
    const value = text.slice(start, end).trim();
    if (value && options.some((option) => option.key === key)) result[key] = value;
  }

  // Glossary order is not authoritative. Use its English headword, never position.
  for (const line of text.split(/\n+/)) {
    const entry = line.trim().match(/^(.+?)\s*(?:\(([^()]*)\))?\s*:\s*(.+)$/);
    if (!entry) continue;
    const word = normalizedWord(entry[1]);
    const meaning = entry[3].trim();
    if (!meaning) continue;
    for (const option of options) {
      if (!result[option.key] && normalizedWord(option.text) === word) result[option.key] = meaning;
    }
  }
  return result;
}
