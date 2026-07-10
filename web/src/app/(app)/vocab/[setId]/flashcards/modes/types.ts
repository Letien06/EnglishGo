import type { VocabWordCard } from "@/types/vocab";

export interface AnswerInputModeProps {
  word: VocabWordCard;
  reverse: boolean;
  typed: string;
  onType: (value: string) => void;
  flipped: boolean;
  onToggleExample: () => void;
  hintAnswer: string;
  hintRevealed: number[];
  remainingHints: number;
  onHint: () => void;
  onSpeakWord: () => void;
  onSubmit: () => void;
}
