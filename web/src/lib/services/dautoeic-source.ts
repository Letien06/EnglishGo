export const DAUTOEIC_SOURCE_VERSION = "dauenglish-v2";

export const DAUTOEIC_DIFFICULTY_BANDS = [
  { level: 1, label: "Dưới 200" },
  { level: 2, label: "200–300" },
  { level: 3, label: "300–400" },
  { level: 4, label: "400–495" },
] as const;

export const DAUTOEIC_LEVEL_COUNT = DAUTOEIC_DIFFICULTY_BANDS.length;

export function dauToeicApiHeaders(apiKey: string): Record<string, string> {
  return {
    apikey: apiKey,
    ...(!apiKey.startsWith("sb_publishable_") ? { Authorization: `Bearer ${apiKey}` } : {}),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
