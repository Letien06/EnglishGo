import type { VocabWordCard } from "@/types/vocab";

export default function FlashcardMode({
  word, reverse, flipped, onFlip, onSpeakWord, onSpeakWordUk, onSpeakExample,
}: {
  word: VocabWordCard;
  reverse: boolean;
  flipped: boolean;
  onFlip: () => void;
  onSpeakWord: () => void;
  onSpeakWordUk: () => void;
  onSpeakExample: () => void;
}) {
  const front = reverse ? word.meaning : word.word;
  const back = reverse ? word.word : word.meaning;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label="Lật thẻ từ vựng"
      onClick={onFlip}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          onFlip();
        }
      }}
      className="premium-card premium-card--interactive mx-auto flex min-h-[360px] max-w-2xl cursor-pointer flex-col items-center justify-center p-10 text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <small className="text-[10px] font-extrabold uppercase tracking-widest text-muted">
        {flipped ? (reverse ? "TỪ TIẾNG ANH" : "NGHĨA TIẾNG VIỆT") : (reverse ? "NGHĨA TIẾNG VIỆT" : "TỪ TIẾNG ANH")}
      </small>
      <strong className="my-3 text-4xl font-extrabold text-ink">{flipped ? back : front}</strong>
      <span className="rounded bg-surface-soft px-2 py-0.5 text-xs text-muted">{word.partOfSpeech || "OTHER"}</span>
      {!reverse && !flipped && (word.phoneticUs || word.phoneticUk || word.phonetic) && (
        <div className="mt-2 flex flex-wrap justify-center gap-2 text-sm font-semibold text-muted">
          {word.phoneticUs && <span>US {word.phoneticUs}</span>}
          {word.phoneticUk && <span>UK {word.phoneticUk}</span>}
          {!word.phoneticUs && !word.phoneticUk && word.phonetic && <span>{word.phonetic}</span>}
        </div>
      )}
      {flipped && word.example && <em className="mt-2 text-sm text-muted">Ví dụ: {word.example}</em>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={(event) => { event.stopPropagation(); onSpeakWord(); }} className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white">US</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onSpeakWordUk(); }} className="rounded-full bg-surface-soft px-3 py-1.5 text-xs font-bold text-ink2">UK</button>
        {flipped && word.example && <button type="button" onClick={(event) => { event.stopPropagation(); onSpeakExample(); }} className="text-xs font-bold text-accent">Nghe ví dụ</button>}
      </div>
      <p className="mt-3 text-xs text-muted">Nhấn Space hoặc click để lật thẻ</p>
    </div>
  );
}
