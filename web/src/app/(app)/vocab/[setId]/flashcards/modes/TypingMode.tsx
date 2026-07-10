import AnswerInputMode from "./AnswerInputMode";
import type { AnswerInputModeProps } from "./types";

export default function TypingMode(props: AnswerInputModeProps) {
  return <AnswerInputMode {...props} listening={false} />;
}
