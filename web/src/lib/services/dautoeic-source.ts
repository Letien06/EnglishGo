export const DAUTOEIC_SOURCE_VERSION = "dauenglish-v1";

export function dauToeicApiHeaders(apiKey: string): Record<string, string> {
  return {
    apikey: apiKey,
    ...(!apiKey.startsWith("sb_publishable_") ? { Authorization: `Bearer ${apiKey}` } : {}),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
