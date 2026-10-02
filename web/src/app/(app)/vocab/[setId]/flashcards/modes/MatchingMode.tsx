import styles from "../vocabulary.module.css";

interface MatchItem { id: number; word: string; meaning: string }

export default function MatchingMode({ words, meanings, matchedIds, selWord, selMeaning, lives, timer, onWord, onMeaning }: {
  words: MatchItem[];
  meanings: MatchItem[];
  matchedIds: number[];
  selWord: number | null;
  selMeaning: number | null;
  lives: number;
  timer: number;
  onWord: (id: number) => void;
  onMeaning: (id: number) => void;
}) {
  const tiles = words.flatMap((word, index) => {
    const meaning = meanings[(index + 2) % meanings.length];
    const pair = [{ item: word, language: "en" as const }, ...(meaning ? [{ item: meaning, language: "vi" as const }] : [])];
    return index % 2 ? pair.reverse() : pair;
  });
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-center justify-between"><div className="text-red-500">{"❤ ".repeat(Math.max(0, lives)).trim()}</div><span className="text-xs text-muted">{timer}s</span></header>
      <p className="text-sm text-muted">Chọn một từ tiếng Anh và nghĩa tiếng Việt tương ứng.</p>
      <div className={styles.matchGrid}>{tiles.map(({ item, language }) => <button key={`${language}-${item.id}`} type="button" className={styles.matchTile} data-language={language} aria-pressed={(language === "en" ? selWord : selMeaning) === item.id} disabled={matchedIds.includes(item.id)} onClick={() => language === "en" ? onWord(item.id) : onMeaning(item.id)}>{matchedIds.includes(item.id) && <span aria-hidden="true">✓ </span>}{language === "en" ? item.word : item.meaning}</button>)}</div>
      <strong className="block text-center text-sm">Đã ghép: {matchedIds.length} / {words.length}</strong>
    </section>
  );
}
