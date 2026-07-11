import type { DictationFeedbackToken, DictationPrompt, DictationPromptToken } from "@/types/dictation";

export type MaskPercent = 30 | 50 | 100;
type Token = { type: "word" | "space" | "punct"; value: string };

export function normalizeDictationAnswer(value: string): string {
  return tokenize(value)
    .filter((token) => token.type === "word")
    .map((token) => normalizeWord(token.value))
    .filter(Boolean)
    .join(" ");
}

export function buildPrompt(segmentId: string, expectedText: string, maskPercent: MaskPercent): DictationPrompt {
  if (maskPercent === 100) return { segmentId, maskPercent, inputMode: "FULL_TEXT", prompt: [] };
  const tokens = tokenize(expectedText);
  const hidden = new Set(selectHiddenIndexes(segmentId, tokens, maskPercent));
  let blankNumber = 0;
  const prompt: DictationPromptToken[] = tokens.map((token, index) => {
    if (!hidden.has(index)) return { kind: token.type === "word" ? "text" : token.type, value: token.value };
    blankNumber += 1;
    return { kind: "blank", blankId: `b${String(blankNumber).padStart(2, "0")}`, length: token.value.length, hint: token.value.slice(0, 1) };
  });
  return { segmentId, maskPercent, inputMode: "BLANKS", prompt };
}

export function gradeDictationAttempt(args: {
  segmentId: string;
  expectedText: string;
  acceptedNormalizedAnswers: string[];
  maskPercent: MaskPercent;
  blankAnswers: Record<string, string> | null;
  fullAnswer: string | null;
}): { scorePercent: number; feedbackTokens: DictationFeedbackToken[]; normalizedAnswer: string } {
  const expectedTokens = wordTokens(args.expectedText);
  const expectedNormalized = expectedTokens.map((token) => normalizeWord(token));
  if (args.maskPercent === 100) {
    const normalizedAnswer = normalizeDictationAnswer(args.fullAnswer ?? "");
    const alternatives = [normalizeDictationAnswer(args.expectedText), ...args.acceptedNormalizedAnswers.map(normalizeDictationAnswer)];
    if (alternatives.includes(normalizedAnswer)) {
      return { scorePercent: 100, normalizedAnswer, feedbackTokens: expectedTokens.map((value) => ({ value, state: "CORRECT" })) };
    }
    const answerTokens = normalizedAnswer ? normalizedAnswer.split(" ") : [];
    const feedbackTokens = diffTokens(expectedNormalized, expectedTokens, answerTokens);
    const correct = feedbackTokens.filter((token) => token.state === "CORRECT").length;
    return { scorePercent: percent(correct, expectedTokens.length), normalizedAnswer, feedbackTokens };
  }

  const prompt = buildPrompt(args.segmentId, args.expectedText, args.maskPercent);
  const blanks = prompt.prompt.filter((token): token is Extract<DictationPromptToken, { kind: "blank" }> => token.kind === "blank");
  const expectedForBlank = blankExpectedValues(args.expectedText, args.segmentId, args.maskPercent);
  let correct = 0;
  const feedbackTokens: DictationFeedbackToken[] = blanks.map((blank, index) => {
    const expected = expectedForBlank[index] ?? "";
    const actual = normalizeDictationAnswer(args.blankAnswers?.[blank.blankId] ?? "");
    const state = actual === normalizeWord(expected) ? "CORRECT" : actual ? "WRONG" : "MISSING";
    if (state === "CORRECT") correct += 1;
    return { value: expected, state };
  });
  return { scorePercent: percent(correct, blanks.length), normalizedAnswer: feedbackTokens.map((token) => token.value).join(" "), feedbackTokens };
}

function blankExpectedValues(expectedText: string, segmentId: string, maskPercent: MaskPercent): string[] {
  const tokens = tokenize(expectedText);
  const hidden = new Set(selectHiddenIndexes(segmentId, tokens, maskPercent));
  return tokens.filter((_, index) => hidden.has(index)).map((token) => token.value);
}

function selectHiddenIndexes(segmentId: string, tokens: Token[], maskPercent: MaskPercent): number[] {
  const eligible = tokens.map((token, index) => ({ token, index })).filter(({ token }) => token.type === "word");
  const count = Math.max(1, Math.ceil(eligible.length * (maskPercent / 100)));
  const scored = eligible.map(({ token, index }) => ({ index, score: scoreWord(token.value) + seededScore(`${segmentId}:${maskPercent}:${index}`) }));
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.min(count, scored.length)).map(({ index }) => index).sort((a, b) => a - b);
}

function tokenize(value: string): Token[] {
  return (value.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)?|\s+|./g) ?? []).map((value) => ({
    value,
    type: /^\s+$/.test(value) ? "space" : /^[A-Za-z]+(?:['’\-][A-Za-z]+)?$/.test(value) ? "word" : "punct",
  }));
}

function wordTokens(value: string): string[] { return tokenize(value).filter((token) => token.type === "word").map((token) => token.value); }
function normalizeWord(value: string): string { return value.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z']/g, ""); }
function scoreWord(value: string): number { return normalizeWord(value).length + (/(ing|tion|ment|able|ive|ous|ed|ly)$/.test(normalizeWord(value)) ? 3 : 0); }
function seededScore(value: string): number { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0) / 0xffffffff; }
function percent(value: number, total: number): number { return total ? Math.round((value / total) * 100) : 0; }

function diffTokens(expectedNormalized: string[], expectedDisplay: string[], actual: string[]): DictationFeedbackToken[] {
  const result: DictationFeedbackToken[] = [];
  const max = Math.max(expectedNormalized.length, actual.length);
  for (let index = 0; index < max; index += 1) {
    const expected = expectedNormalized[index];
    const answer = actual[index];
    if (expected && answer === expected) result.push({ value: expectedDisplay[index], state: "CORRECT" });
    else if (expected && !answer) result.push({ value: expectedDisplay[index], state: "MISSING" });
    else if (expected) result.push({ value: expectedDisplay[index], state: "WRONG" });
    else result.push({ value: answer, state: "EXTRA" });
  }
  return result;
}
