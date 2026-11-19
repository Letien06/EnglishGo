/**
 * Vocabulary file import parsers.
 * Supports CSV, TSV, TXT, XLSX (via ExcelJS), and PDF (via pdf-parse).
 */
import type { AiVocabCandidate } from "@/types/vocab";

const MAX_IMPORT_ROWS = 2_000;
const MAX_IMPORT_TEXT_CHARS = 500_000;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function parseImportFile(
  buffer: Buffer,
  filename: string,
): Promise<AiVocabCandidate[]> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".xlsx")) {
    return parseExcelWords(buffer);
  }
  if (lower.endsWith(".xls")) {
    throw new Error("Định dạng .xls cũ không còn được hỗ trợ vì lý do bảo mật. Vui lòng lưu file sang .xlsx hoặc .csv.");
  }
  if (lower.endsWith(".pdf")) {
    return parsePdfWords(buffer);
  }
  // CSV, TSV, TXT
  const text = buffer.toString("utf-8").slice(0, MAX_IMPORT_TEXT_CHARS);
  return parseDelimitedWords(text);
}

/* ------------------------------------------------------------------ */
/*  Delimited text (CSV/TSV/TXT)                                       */
/* ------------------------------------------------------------------ */

export function parseDelimitedWords(text: string): AiVocabCandidate[] {
  const lines = text
    .slice(0, MAX_IMPORT_TEXT_CHARS)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, MAX_IMPORT_ROWS + 1);
  const rows: string[][] = [];

  for (const line of lines) {
    const fields = parseDelimitedLine(line);
    if (fields.length > 0) {
      rows.push(fields);
    }
  }

  return rowsToCandidates(rows);
}

function parseDelimitedLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((s) => s.trim());
  }
  // Format used by the quick-add dialog: word | phonetic | type | meaning | example
  if (line.includes("|")) {
    return line.split("|").map((s) => s.trim());
  }
  // Remaining delimited formats: semicolon, then comma
  if (line.includes(";")) {
    return line.split(";").map((s) => s.trim());
  }
  if (line.includes(",")) {
    return parseCsvLine(line);
  }
  return [line.trim()];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/* ------------------------------------------------------------------ */
/*  Excel (XLSX via ExcelJS)                                           */
/* ------------------------------------------------------------------ */

async function parseExcelWords(buffer: Buffer): Promise<AiVocabCandidate[]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  const limit = Math.min(sheet.rowCount, MAX_IMPORT_ROWS + 1);
  for (let rowIndex = 1; rowIndex <= limit; rowIndex++) {
    const row = sheet.getRow(rowIndex);
    const values: string[] = [];
    const colLimit = Math.min(row.cellCount, 12);
    for (let colIndex = 1; colIndex <= colLimit; colIndex++) {
      values.push(cellToString(row.getCell(colIndex).value));
    }
    if (values.some((v) => v.length > 0)) {
      rows.push(values);
    }
  }

  return rowsToCandidates(rows);
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const obj = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
    if (typeof obj.text === "string") return obj.text.trim();
    if (obj.result != null) return String(obj.result).trim();
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part) => part.text ?? "").join("").trim();
    }
  }
  return String(value).trim();
}

/* ------------------------------------------------------------------ */
/*  PDF                                                                */
/* ------------------------------------------------------------------ */

async function parsePdfWords(buffer: Buffer): Promise<AiVocabCandidate[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText({ first: 1, last: 50 });
    const text = (data.text ?? "").slice(0, MAX_IMPORT_TEXT_CHARS);
    return parseDelimitedWords(text);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/*  Rows -> Candidates                                                 */
/* ------------------------------------------------------------------ */

function rowsToCandidates(rows: string[][]): AiVocabCandidate[] {
  if (rows.length === 0) return [];

  let dataRows = rows;
  let headerMap: Record<string, number> | null = null;

  if (looksLikeHeader(rows[0])) {
    headerMap = buildHeaderMap(rows[0]);
    dataRows = rows.slice(1);
  }

  const candidates: AiVocabCandidate[] = [];

  for (const row of dataRows.slice(0, MAX_IMPORT_ROWS)) {
    const word = headerMap
      ? cellByHeader(row, headerMap, "word", "từ", "vocabulary", "english")
      : row[0] ?? "";

    if (!word.trim()) continue;

    const rowShape = headerMap ? null : inferDelimitedRowShape(row);

    const meaning = headerMap
      ? cellByHeader(row, headerMap, "meaning", "nghĩa", "vietnamese", "definition")
      : rowShape?.meaning ?? row[1] ?? "";

    const partOfSpeech = headerMap
      ? cellByHeader(row, headerMap, "partOfSpeech", "part_of_speech", "pos", "loại từ", "type")
      : rowShape?.partOfSpeech ?? row[2] ?? "";

    const phonetic = headerMap
      ? cellByHeader(row, headerMap, "phonetic", "ipa", "pronunciation", "phiên âm")
      : rowShape?.phonetic ?? row[3] ?? "";

    const example = headerMap
      ? cellByHeader(row, headerMap, "example", "ví dụ", "sentence", "câu")
      : rowShape?.example ?? row[4] ?? "";

    candidates.push({
      word: word.trim(),
      meaning: meaning.trim(),
      partOfSpeech: normalizePartOfSpeech(partOfSpeech.trim()),
      phonetic: phonetic.trim() || undefined,
      example: example.trim() || undefined,
      selected: true,
    });
  }

  return candidates;
}

function inferDelimitedRowShape(row: string[]): {
  meaning: string;
  partOfSpeech: string;
  phonetic: string;
  example: string;
} | null {
  const second = row[1] ?? "";
  const third = row[2] ?? "";
  const fourth = row[3] ?? "";
  if (row.length >= 4 && (looksLikePhonetic(second) || looksLikePartOfSpeech(third))) {
    return {
      phonetic: second,
      partOfSpeech: third,
      meaning: fourth,
      example: row[4] ?? "",
    };
  }
  return null;
}

function looksLikePhonetic(value: string): boolean {
  const trimmed = value.trim();
  return /^\/.+\/$/.test(trimmed) || /[ˈˌəɪʊɔɑæɛɜʃʒθðŋ]/i.test(trimmed);
}

function looksLikePartOfSpeech(value: string): boolean {
  return /^(n|noun|v|verb|adj|adjective|adv|adverb|other)$/i.test(value.trim());
}

const EXACT_HEADER_TOKENS = new Set([
  "word",
  "words",
  "từ",
  "từvựng",
  "vocabulary",
  "english",
  "meaning",
  "meanings",
  "nghĩa",
  "tiếngviệt",
  "vietnamese",
  "definition",
  "phonetic",
  "ipa",
  "pronunciation",
  "phiênâm",
  "partofspeech",
  "pos",
  "loạitừ",
  "type",
  "example",
  "examples",
  "vídụ",
  "sentence",
]);

function looksLikeHeader(row: string[]): boolean {
  let matches = 0;
  for (const cell of row) {
    const normalized = normalizeHeader(cell);
    if (normalized && EXACT_HEADER_TOKENS.has(normalized)) {
      matches++;
    }
  }
  // Require at least 2 recognized header columns, or a single exact header column on 1-column input.
  return matches >= 2 || (row.length === 1 && matches === 1);
}

function buildHeaderMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (normalized) {
      map[normalized] = index;
    }
  });
  return map;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/g, "");
}

function cellByHeader(
  row: string[],
  headerMap: Record<string, number>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const index = headerMap[normalizedKey];
    if (index !== undefined && index < row.length) {
      return row[index];
    }
  }
  return "";
}

function normalizePartOfSpeech(value: string): string {
  const upper = value.toUpperCase().trim();
  switch (upper) {
    case "NOUN":
    case "N":
      return "NOUN";
    case "VERB":
    case "V":
      return "VERB";
    case "ADJ":
    case "ADJECTIVE":
      return "ADJ";
    case "ADV":
    case "ADVERB":
      return "ADV";
    default:
      return "OTHER";
  }
}
