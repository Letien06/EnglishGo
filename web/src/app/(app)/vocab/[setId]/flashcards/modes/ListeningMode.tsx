import AnswerInputMode from "./AnswerInputMode";
import type { AnswerInputModeProps } from "./types";

export default function ListeningMode(props: AnswerInputModeProps) {
  return <AnswerInputMode {...props} listening />;
}
