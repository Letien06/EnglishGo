/**
 * Gemini AI vocabulary generation service.
 * Port of `service/GeminiVocabularyService.java`.
 *
 * Calls Gemini REST API for word generation/suggestion with the same
 * prompts as the Java version.
 */
import { serverEnv } from "@/lib/env";
import { withGeminiConcurrency } from "@/lib/services/distributed-concurrency";
import type { GeneratedVocabWord } from "@/types/vocab";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function generateFromTopic(
  input: string,
  count: number,
): Promise<GeneratedVocabWord[]> {
  requireText(input);
  const prompt = `${basePrompt(count)}\nTopic: "${input}".\nReturn a JSON array.`;
  return parseWords(await generateResponse(prompt));
}

export async function suggestWordsFromTopic(
  input: string,
  count: number,
  excludedWords: string[] = [],
): Promise<string[]> {
  requireText(input);
  const prompt = `${suggestionPrompt(count, excludedWords)}\nTopic: "${input}".\nReturn a JSON array of strings.`;
  return suggestWords(prompt);
}

export async function generateFromReading(
  passage: string,
  count: number,
): Promise<GeneratedVocabWord[]> {
  requireText(passage);
  const prompt = `${basePrompt(count)}\nExtract vocabulary from this passage:\n"""${passage}"""\nReturn a JSON array.`;
  return parseWords(await generateResponse(prompt));
}

export async function suggestWordsFromReading(
  passage: string,
  count: number,
  excludedWords: string[] = [],
): Promise<string[]> {
  requireText(passage);
  const prompt = `${suggestionPrompt(count, excludedWords)}\nExtract from passage:\n"""${passage}"""\nReturn a JSON array of strings.`;
  return suggestWords(prompt);
}

export async function generateFromImage(
  imageBase64: string,
  mimeType: string,
  count: number,
): Promise<GeneratedVocabWord[]> {
  const prompt = `${basePrompt(count)}\nLook at the image. Identify English words, text, or objects visible. Return a JSON array.`;
  return parseWords(
    await generateResponse(prompt, { data: imageBase64, mimeType }),
  );
}

export async function suggestWordsFromImage(
  imageBase64: string,
  mimeType: string,
  count: number,
  excludedWords: string[] = [],
): Promise<string[]> {
  const prompt = `${suggestionPrompt(count, excludedWords)}\nLook at the image. Identify English words, text, or objects visible. Return a JSON array of strings.`;
  return suggestWords(prompt, { data: imageBase64, mimeType });
}

export interface DictionaryDefinitionForTranslation {
  word: string;
  partOfSpeech: string;
  definition: string;
}

export interface DictionaryExampleRequest {
  word: string;
  partOfSpeech: string;
  meaning: string;
}

export async function translateDictionaryDefinitions(
  definitions: DictionaryDefinitionForTranslation[],
): Promise<Record<string, string>> {
  if (definitions.length === 0) return {};

  const items = definitions.map((d) => ({
    word: d.word,
    partOfSpeech: d.partOfSpeech,
    definition: d.definition,
  }));

  const prompt = `You are a professional English-Vietnamese translator for TOEIC learners.
Translate each English definition into natural, concise Vietnamese (≤ 12 words, no quotes, no parentheses).
Input: ${JSON.stringify(items)}
Return a JSON array of objects with "word" and "meaning" keys.`;

  const response = await generateResponse(prompt);
  const result: Record<string, string> = {};
  if (Array.isArray(response)) {
    for (const item of response) {
      if (item.word && item.meaning) {
        result[item.word] = item.meaning;
      }
    }
  }
  return result;
}

export async function generateDictionaryExamples(
  entries: DictionaryExampleRequest[],
): Promise<Record<string, string>> {
  if (entries.length === 0) return {};

  const items = entries.map((e) => ({
    word: e.word,
    partOfSpeech: e.partOfSpeech,
    meaning: e.meaning,
  }));

  const prompt = `You are an English teacher writing example sentences for TOEIC learners.
For each word, write ONE natural example sentence (10-18 words, business/office context, the word must appear in the sentence).
Input: ${JSON.stringify(items)}
Return a JSON array of objects with "word" and "example" keys.`;

  const response = await generateResponse(prompt);
  const result: Record<string, string> = {};
  if (Array.isArray(response)) {
    for (const item of response) {
      if (item.word && item.example) {
        result[item.word] = item.example;
      }
    }
  }
  return result;
}

export async function generateJson(prompt: string): Promise<unknown> {
  requireText(prompt);
  return generateResponse(prompt);
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

interface ImagePart {
  data: string;
  mimeType: string;
}

async function suggestWords(
  prompt: string,
  imagePart?: ImagePart,
): Promise<string[]> {
  const response = await generateResponse(prompt, imagePart);
  if (Array.isArray(response)) {
    return cleanWordList(
      response.map((item: unknown) =>
        typeof item === "string" ? item : String(item),
      ),
    );
  }
  return [];
}

async function generateResponse(
  prompt: string,
  imagePart?: ImagePart,
): Promise<unknown> {
  return withGeminiConcurrency(() => requestGemini(prompt, imagePart));
}

async function requestGemini(
  prompt: string,
  imagePart?: ImagePart,
): Promise<unknown> {
  const apiKey = serverEnv.geminiApiKey;
  const model = serverEnv.geminiModel;
  const baseUrl =
    process.env.GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (imagePart) {
    parts.push({
      inline_data: {
        mime_type: imagePart.mimeType,
        data: imagePart.data,
      },
    });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.35,
    },
  };

  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    const errorMsg = geminiErrorMessage(model, res.status, errorBody);
    throw new Error(errorMsg);
  }

  const json = await res.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  const jsonStr = extractJson(text);
  return JSON.parse(jsonStr);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = timeoutFromEnv("GEMINI_TIMEOUT_MS", 20_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gemini request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function timeoutFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1_000 && value <= 60_000
    ? value
    : fallback;
}

function geminiErrorMessage(
  model: string,
  status: number,
  body: string,
): string {
  const providerMsg = geminiProviderMessage(body);
  return `Gemini ${model} returned ${status}${providerMsg ? ": " + providerMsg : ""}`;
}

function geminiProviderMessage(body: string): string {
  try {
    const json = JSON.parse(body);
    return json?.error?.message ?? "";
  } catch {
    return "";
  }
}

function parseWords(response: unknown): GeneratedVocabWord[] {
  if (!Array.isArray(response)) return [];
  return response
    .filter(
      (item: Record<string, unknown>) =>
        typeof item.word === "string" && item.word.trim(),
    )
    .map((item: Record<string, unknown>) => ({
      word: String(item.word).trim(),
      meaning: String(item.meaning ?? "").trim(),
      partOfSpeech: normalizePartOfSpeech(
        String(item.partOfSpeech ?? item.part_of_speech ?? "OTHER"),
      ),
      phonetic: cleanOptional(String(item.phonetic ?? "")),
      example: cleanOptional(String(item.example ?? "")),
    }));
}

function extractJson(text: string): string {
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.substring(arrayStart, arrayEnd + 1);
  }
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.substring(objectStart, objectEnd + 1);
  }
  return text;
}

function basePrompt(count: number): string {
  return `You are a vocabulary teacher for Vietnamese TOEIC learners.
Generate exactly ${count} English vocabulary words.
For each word return: word, meaning (in Vietnamese, concise ≤10 words), partOfSpeech (one of: NOUN, VERB, ADJ, ADV, OTHER), phonetic (IPA), example (one English sentence 10-18 words using the word in a business/office context).
Only return headwords (no phrases). Avoid duplicates.`;
}

function suggestionPrompt(
  count: number,
  excludedWords: string[],
): string {
  const excludeNote =
    excludedWords.length > 0
      ? `\nDo NOT include these words: ${excludedWords.join(", ")}.`
      : "";
  return `You are a vocabulary teacher for Vietnamese TOEIC learners.
Suggest exactly ${count} English headwords (single words only, no phrases).
Only return the words as a flat JSON array of strings.${excludeNote}`;
}

function cleanWordList(words: string[]): string[] {
  return words
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0 && !w.includes(" "));
}

function normalizePartOfSpeech(value: string): string {
  const upper = value.toUpperCase().trim();
  switch (upper) {
    case "NOUN":
    case "VERB":
    case "ADJ":
    case "ADJECTIVE":
      return upper === "ADJECTIVE" ? "ADJ" : upper;
    case "ADV":
    case "ADVERB":
      return "ADV";
    default:
      return "OTHER";
  }
}

function requireText(value: string): void {
  if (!value || !value.trim()) {
    throw new Error("Input text is required");
  }
}

function cleanOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
