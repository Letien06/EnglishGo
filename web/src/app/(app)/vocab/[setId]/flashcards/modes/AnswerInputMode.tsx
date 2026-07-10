import type { AnswerInputModeProps } from "./types";

export default function AnswerInputMode({ listening, word, reverse, typed, onType, flipped, onToggleExample, hintAnswer, hintRevealed, remainingHints, onHint, onSpeakWord, onSubmit }: AnswerInputModeProps & { listening: boolean }) {
  const prompt = listening ? "Nghe và gõ từ tiếng Anh" : reverse ? word.meaning : word.word;
  const placeholder = listening ? "Gõ từ bạn nghe được..." : reverse ? "Gõ từ tiếng Anh..." : "Gõ nghĩa tiếng Việt...";
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 text-center">
      {listening ? <button type="button" onClick={onSpeakWord} className="mx-auto flex h-20 w-20 flex-col items-center justify-center rounded-full bg-accent text-white">♫<b className="text-[10px]">CTRL + X</b></button> : <button type="button" onClick={onSpeakWord} className="font-bold text-accent">♫ Nghe từ</button>}
      <h2 className="text-xl font-bold text-ink">{prompt}</h2>
      <em className="block text-sm text-muted">{flipped && word.example ? word.example : "Chưa có gợi ý"}</em>
      {hintAnswer && <div className="flex flex-wrap justify-center gap-1">{[...hintAnswer].map((char, index) => /\s/u.test(char) ? <span key={index} className="w-3" /> : !/[\p{L}\p{N}]/u.test(char) ? <span key={index} className="text-muted">{char}</span> : <span key={index} className={`flex h-8 w-6 items-center justify-center rounded border text-sm font-bold ${hintRevealed.includes(index) ? "border-accent text-accent" : "border-line text-transparent"}`}>{hintRevealed.includes(index) ? char : "_"}</span>)}</div>}
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="flex items-center justify-center gap-2">
        <input value={typed} onChange={(event) => onType(event.target.value)} placeholder={placeholder} className="w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" autoFocus />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Kiểm tra</button>
      </form>
      <div className="flex items-center justify-center gap-2"><button type="button" onClick={onToggleExample} className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink2">Xem ví dụ</button><button type="button" onClick={onHint} disabled={remainingHints <= 0} className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink2 disabled:opacity-40">Gợi ý ({remainingHints})</button></div>
    </section>
  );
}
