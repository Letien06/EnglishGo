/**
 * Vocabulary file import parsers.
 * Port of parsing logic from `VocabService.java` (parseDelimitedWords,
 * parseExcelWords, parseCsv, readTextFile, extractPdfText).
 *
 * Replaces Apache POI (Excel) with `xlsx` and PDFBox with `pdf-parse`.
 */
import type { AiVocabCandidate } from "@/types/vocab";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse a file buffer into vocab candidates.
 * Supports CSV, TSV, TXT, XLSX, XLS, PDF.
 */
export async function parseImportFile(
  buffer: Buffer,
  filename: string,
): Promise<AiVocabCandidate[]> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseExcelWords(buffer);
  }
  if (lower.endsWith(".pdf")) {
    return parsePdfWords(buffer);
  }
  // CSV, TSV, TXT
  const text = buffer.toString("utf-8");
  return parseDelimitedWords(text);
}

/* ------------------------------------------------------------------ */
/*  Delimited text (CSV/TSV/TXT)                                       */
/* ------------------------------------------------------------------ */

export function parseDelimitedWords(text: string): AiVocabCandidate[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
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
  // Format used by the quick-add dialog: word | phonetic | type | meaning | example
  if (line.includes("|")) {
    return line.split("|").map((s) => s.trim());
  }
  // Try tab first, then semicolon, then comma
  if (line.includes("\t")) {
    return line.split("\t").map((s) => s.trim());
  }
  if (line.includes(";")) {
    return line.split(";").map((s) => s.trim());
  }
  // For comma: only split if there's no quoted content
  if (line.includes(",")) {
    return parseCsvLine(line);
  }
  // Single field
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
/*  Excel (XLSX/XLS)                                                   */
/* ------------------------------------------------------------------ */

async function parseExcelWords(buffer: Buffer): Promise<AiVocabCandidate[]> {
  // Dynamic import to avoid bundling xlsx on every page
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const jsonRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  const rows: string[][] = jsonRows.map((row) =>
    (row as unknown[]).map((cell) => String(cell ?? "").trim()),
  );

  return rowsToCandidates(rows);
}

/* ------------------------------------------------------------------ */
/*  PDF                                                                */
/* ------------------------------------------------------------------ */

async function parsePdfWords(buffer: Buffer): Promise<AiVocabCandidate[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  const text = data.text ?? "";
  return parseDelimitedWords(text);
}

/* ------------------------------------------------------------------ */
/*  Rows → Candidates                                                  */
/* ------------------------------------------------------------------ */

function rowsToCandidates(rows: string[][]): AiVocabCandidate[] {
  if (rows.length === 0) return [];

  // Check if first row looks like a header
  let dataRows = rows;
  let headerMap: Record<string, number> | null = null;

  if (looksLikeHeader(rows[0])) {
    headerMap = buildHeaderMap(rows[0]);
    dataRows = rows.slice(1);
  }

  const candidates: AiVocabCandidate[] = [];

  for (const row of dataRows) {
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

function looksLikeHeader(row: string[]): boolean {
  const headerKeywords = [
    "word",
    "từ",
    "vocabulary",
    "english",
    "meaning",
    "nghĩa",
    "definition",
    "phonetic",
    "ipa",
    "example",
  ];
  const lowerRow = row.map((c) => c.toLowerCase().trim());
  return lowerRow.some((cell) =>
    headerKeywords.some((kw) => cell.includes(kw)),
  );
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
