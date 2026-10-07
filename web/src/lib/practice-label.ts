/** Presentation only: source names remain intact for content and media lookup. */
export function formatPracticeLabel(label: string): string {
  return label.replace(/\bcrack\b/gi, "").replace(/\s+/g, " ").trim() || "TOEIC";
}
