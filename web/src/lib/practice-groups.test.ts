import { describe, expect, it } from "vitest";
import { BALANCED_PRACTICE_PARTS, regroupPracticeSnapshot } from "../../scripts/lib/practice-groups.mjs";
import type { DauToeicDifficultyLevel, DauToeicDifficultySession } from "../types/dautoeic";

function fixture(count = 10) {
  const materials: Array<{ key: string; kind: string; payload: unknown }> = [];
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    const items = Array.from({ length: count }, (_, index) => ({
      id: `part-${part}-item-${String(count - index).padStart(3, "0")}`, part, level: 3,
      itemType: [1, 2, 5].includes(part) ? "question" : "passage",
      audioUrl: `https://example.com/${part}/${index}.mp3`, transcript: `Đoạn ${index}`,
      totalAttempts: 0, wrongCount: 0, errorRate: 0,
      questions: Array.from({ length: [1, 2, 5].includes(part) ? 1 : 3 }, (_, question) => ({
        id: `question-${part}-${index}-${question}`, difficultyLevel: 3, correctAnswer: "B", explanationVi: "Giải thích",
      })),
    }));
    materials.push({
      key: `dauenglish-v2__${skill}__levels__${part}`, kind: "difficulty-levels",
      payload: [1, 2, 3, 4].map((level) => ({
        part, level, title: `Level ${level}`, total: level === 3 ? count : 0,
        itemIds: level === 3 ? items.map((item) => item.id) : [],
        done: 0, correct: 0, wrong: 0, remaining: level === 3 ? count : 0,
        totalAttempts: 0, wrongAttempts: 0, errorRateMin: 0, errorRateMax: 0,
      })),
    });
    for (let level = 1; level <= 4; level++) materials.push({
      key: `dauenglish-v2__${skill}__session__${part}__${level}__all`, kind: "difficulty-session",
      payload: { part, level, title: `Level ${level}`, total: level === 3 ? count : 0, items: level === 3 ? items : [] },
    });
  }
  materials.push({ key: "dauenglish-v2__test__original", kind: "test", payload: { id: "original", totalQuestions: 200 } });
  return { source: "https://dauenglish.com", sourceVersion: "dauenglish-v2", syncedAt: "2026-10-02T00:00:00Z", materials };
}

function session(snapshot: ReturnType<typeof fixture>, part: number, level: number) {
  const skill = part <= 4 ? "listening" : "reading";
  return snapshot.materials.find((material) => material.key === `dauenglish-v2__${skill}__session__${part}__${level}__all`)!.payload as DauToeicDifficultySession;
}

describe("balanced practice groups", () => {
  it("divides each affected part evenly with no missing or duplicate items", () => {
    const original = fixture(250);
    const grouped = regroupPracticeSnapshot(original);
    for (const part of BALANCED_PRACTICE_PARTS) {
      const groups = [1, 2, 3, 4].map((level) => session(grouped, part, level));
      expect(groups.map((group) => group.total)).toEqual([63, 63, 62, 62]);
      expect(new Set(groups.flatMap((group) => group.items.map((item) => item.id))).size).toBe(250);
      for (const group of groups) {
        expect(group.grouping).toBe("balanced");
        expect(group.title).toBe(`Nhóm luyện tập ${group.level}`);
        expect(group.items.every((item) => item.level === group.level && item.sourceLevel === 3)).toBe(true);
        const levels = grouped.materials.find((material: { key: string }) => material.key.endsWith(`__levels__${part}`)).payload as DauToeicDifficultyLevel[];
        expect(levels[group.level - 1]).toMatchObject({ total: group.total, itemIds: group.items.map((item) => item.id), errorRateMin: null, errorRateMax: null });
      }
    }
  });

  it("preserves each passage, its questions, answers, media, and source difficulty", () => {
    const original = fixture();
    const before = JSON.stringify(original);
    const grouped = regroupPracticeSnapshot(original);
    for (const part of BALANCED_PRACTICE_PARTS) {
      const sourceItems = new Map(session(original, part, 3).items.map((item) => [item.id, item]));
      for (const level of [1, 2, 3, 4]) for (const item of session(grouped, part, level).items) {
        const source = sourceItems.get(item.id)!;
        expect(item.questions).toBe(source.questions);
        expect(item).toEqual({ ...source, level, sourceLevel: 3 });
      }
    }
    expect(JSON.stringify(original)).toBe(before);
    for (const material of original.materials.filter((entry) => entry.kind === "test" || /__(?:levels__|session__)(?:1|5)(?:__|$)/.test(entry.key))) {
      expect(grouped.materials.find((entry: { key: string }) => entry.key === material.key)).toBe(material);
    }
  });

  it("is deterministic regardless of input order and safe to run again", () => {
    const original = fixture();
    const grouped = regroupPracticeSnapshot(original);
    for (const part of BALANCED_PRACTICE_PARTS) session(original, part, 3).items.reverse();
    expect(regroupPracticeSnapshot(original)).toEqual(grouped);
    expect(regroupPracticeSnapshot(grouped)).toEqual(grouped);
  });

  it.each([0, 1, 3, 4, 5])("handles a small bank of %i items without cloning content", (count) => {
    const grouped = regroupPracticeSnapshot(fixture(count));
    const sizes = [1, 2, 3, 4].map((level) => session(grouped, 2, level).total);
    expect(sizes.reduce((sum, total) => sum + total, 0)).toBe(count);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("rejects duplicates and incomplete groups instead of dropping content", () => {
    const duplicate = fixture();
    session(duplicate, 2, 1).items.push(session(duplicate, 2, 3).items[0]);
    expect(() => regroupPracticeSnapshot(duplicate)).toThrow("Duplicate practice item");
    const missing = fixture();
    missing.materials = missing.materials.filter((material) => !material.key.endsWith("__session__2__4__all"));
    expect(() => regroupPracticeSnapshot(missing)).toThrow("Invalid session");
    const empty = fixture();
    session(empty, 3, 3).items[0].questions = [];
    expect(() => regroupPracticeSnapshot(empty)).toThrow("Invalid practice item");
  });
});
