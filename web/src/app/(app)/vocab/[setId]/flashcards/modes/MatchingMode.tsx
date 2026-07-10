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
  const tone = (id: number, selected: number | null) => matchedIds.includes(id) ? "border-green-500 bg-green-500/10 opacity-60" : selected === id ? "border-accent bg-accent/10" : "border-line hover:border-accent/50";
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-center justify-between"><div className="text-red-500">{"❤ ".repeat(Math.max(0, lives)).trim()}</div><span className="text-xs text-muted">{timer}s</span></header>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><h3 className="text-xs font-semibold text-muted">Tiếng Anh</h3>{words.map((item) => <button key={item.id} type="button" disabled={matchedIds.includes(item.id)} onClick={() => onWord(item.id)} className={`block w-full rounded-lg border px-3 py-2 text-sm ${tone(item.id, selWord)}`}>{item.word}</button>)}</div>
        <div className="space-y-2"><h3 className="text-xs font-semibold text-muted">Tiếng Việt</h3>{meanings.map((item) => <button key={item.id} type="button" disabled={matchedIds.includes(item.id)} onClick={() => onMeaning(item.id)} className={`block w-full rounded-lg border px-3 py-2 text-sm ${tone(item.id, selMeaning)}`}>{item.meaning}</button>)}</div>
      </div>
      <strong className="block text-center text-sm">Đã ghép: {matchedIds.length} / {words.length}</strong>
    </section>
  );
}
