import type { TranscriptCue } from "@/types/dictation";

export function parseTranscript(value: string): TranscriptCue[] {
  const normalized = value.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
  if (!normalized) return [];
  const blocks = normalized.replace(/^WEBVTT[^\n]*\n?/i, "").split(/\n\s*\n/);
  const cues: TranscriptCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;
    const match = lines[timeIndex].match(/^([^\s]+)\s+-->\s+([^\s]+)/);
    if (!match) throw new Error(`Invalid transcript timestamp: ${lines[timeIndex]}`);
    const startSeconds = timestampToSeconds(match[1]);
    const endSeconds = timestampToSeconds(match[2]);
    const text = cleanTranscriptText(lines.slice(timeIndex + 1).join(" "));
    if (!text || endSeconds <= startSeconds) continue;
    cues.push({ startSeconds, endSeconds, text });
  }
  return cues.sort((a, b) => a.startSeconds - b.startSeconds);
}

export function mergeTranscriptCues(cues: TranscriptCue[], maxSeconds = 18): TranscriptCue[] {
  const merged: TranscriptCue[] = [];
  for (const cue of cues) {
    const previous = merged.at(-1);
    const canMerge = previous
      && cue.startSeconds - previous.endSeconds <= 0.8
      && cue.endSeconds - previous.startSeconds <= maxSeconds;
    if (canMerge) {
      previous.endSeconds = cue.endSeconds;
      previous.text = `${previous.text} ${cue.text}`.replace(/\s+/g, " ").trim();
    } else {
      merged.push({ ...cue });
    }
  }
  return merged;
}

function timestampToSeconds(value: string): number {
  const parts = value.replace(",", ".").split(":");
  if (parts.length < 2 || parts.length > 3) throw new Error(`Invalid transcript timestamp: ${value}`);
  const seconds = Number(parts.at(-1));
  const minutes = Number(parts.at(-2));
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite)) throw new Error(`Invalid transcript timestamp: ${value}`);
  return hours * 3600 + minutes * 60 + seconds;
}

function cleanTranscriptText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
