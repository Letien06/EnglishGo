import type { VocabWordCard } from "@/types/vocab";

type FlashcardFaceProps = {
  active: boolean;
  className: string;
  label: string;
  value: string;
  word: VocabWordCard;
  showPhonetic: boolean;
  showExample: boolean;
  onSpeakWord: () => void;
  onSpeakWordUk: () => void;
  onSpeakExample: () => void;
};

function FlashcardFace({
  active,
  className,
  label,
  value,
  word,
  showPhonetic,
  showExample,
  onSpeakWord,
  onSpeakWordUk,
  onSpeakExample,
}: FlashcardFaceProps) {
  const stopFlip = (event: React.SyntheticEvent<HTMLButtonElement>) => event.stopPropagation();

  const stopFlipShortcut = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") event.stopPropagation();
  };

  return (
    <section className={`flashcard-face ${className}`} aria-hidden={!active}>
      <div className="flashcard-face-glow" aria-hidden="true" />
      <div className="flashcard-face-content">
        <span className="flashcard-side-label">{label}</span>
        <strong className="flashcard-term">{value}</strong>
        <span className="flashcard-part-of-speech">{word.partOfSpeech || "OTHER"}</span>

        {showPhonetic && (word.phoneticUs || word.phoneticUk || word.phonetic) && (
          <div className="flashcard-phonetics">
            {word.phoneticUs && <span>US {word.phoneticUs}</span>}
            {word.phoneticUk && <span>UK {word.phoneticUk}</span>}
            {!word.phoneticUs && !word.phoneticUk && word.phonetic && <span>{word.phonetic}</span>}
          </div>
        )}

        {showExample && word.example && (
          <p className="flashcard-example">Ví dụ: {word.example}</p>
        )}

        <div className="flashcard-audio-controls" data-flashcard-audio-control>
          <button
            type="button"
            tabIndex={active ? 0 : -1}
            onPointerDown={stopFlip}
            onKeyDown={stopFlipShortcut}
            onClick={(event) => {
              stopFlip(event);
              onSpeakWord();
            }}
            className="flashcard-audio-button flashcard-audio-button--primary"
          >
            US
          </button>
          <button
            type="button"
            tabIndex={active ? 0 : -1}
            onPointerDown={stopFlip}
            onKeyDown={stopFlipShortcut}
            onClick={(event) => {
              stopFlip(event);
              onSpeakWordUk();
            }}
            className="flashcard-audio-button"
          >
            UK
          </button>
          {showExample && word.example && (
            <button
              type="button"
              tabIndex={active ? 0 : -1}
              onPointerDown={stopFlip}
              onKeyDown={stopFlipShortcut}
              onClick={(event) => {
                stopFlip(event);
                onSpeakExample();
              }}
              className="flashcard-example-audio"
            >
              Nghe ví dụ
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

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
  const frontIsEnglish = !reverse;
  const backIsEnglish = reverse;

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-flashcard-audio-control]")
    ) {
      return;
    }
    onFlip();
  };

  return (
    <div className="flashcard-experience mx-auto max-w-2xl">
      <div
        className={`flashcard-scene ${flipped ? "is-flipped" : ""}`}
        onClick={handleCardClick}
      >
        <div className="flashcard-card">
          <FlashcardFace
            active={!flipped}
            className="flashcard-face--front"
            label={frontIsEnglish ? "Từ tiếng Anh" : "Nghĩa tiếng Việt"}
            value={front}
            word={word}
            showPhonetic={frontIsEnglish}
            showExample={false}
            onSpeakWord={onSpeakWord}
            onSpeakWordUk={onSpeakWordUk}
            onSpeakExample={onSpeakExample}
          />
          <FlashcardFace
            active={flipped}
            className="flashcard-face--back"
            label={backIsEnglish ? "Từ tiếng Anh" : "Nghĩa tiếng Việt"}
            value={back}
            word={word}
            showPhonetic={backIsEnglish}
            showExample
            onSpeakWord={onSpeakWord}
            onSpeakWordUk={onSpeakWordUk}
            onSpeakExample={onSpeakExample}
          />
        </div>
      </div>

      <div className="flashcard-flip-hint">
        <button
          type="button"
          onClick={onFlip}
          className="flashcard-flip-button"
          aria-pressed={flipped}
        >
          <span aria-hidden="true">↻</span>
          {flipped ? "Lật về mặt trước" : "Lật thẻ"}
        </button>
        <p>Click vào thẻ hoặc nhấn Space để lật</p>
      </div>
    </div>
  );
}
