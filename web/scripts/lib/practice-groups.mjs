import { DAUTOEIC_DIFFICULTY_BANDS, DAUTOEIC_SOURCE_VERSION } from "../../src/lib/services/dautoeic-source.ts";

export const BALANCED_PRACTICE_PARTS = [2, 3, 4, 6, 7];

export function regroupPracticeSnapshot(snapshot) {
  const materials = new Map(snapshot.materials.map((material) => [material.key, material]));
  if (materials.size !== snapshot.materials.length) throw new Error("Duplicate material keys.");
  const replacements = new Map();
  const key = (...parts) => [DAUTOEIC_SOURCE_VERSION, ...parts].join("__");

  for (const part of BALANCED_PRACTICE_PARTS) {
    const skill = part <= 4 ? "listening" : "reading";
    const levelsKey = key(skill, "levels", part);
    const levelsMaterial = materials.get(levelsKey);
    if (levelsMaterial?.kind !== "difficulty-levels") throw new Error(`Missing levels: Part ${part}`);
    const sessions = DAUTOEIC_DIFFICULTY_BANDS.map(({ level }) => {
      const material = materials.get(key(skill, "session", part, level, "all"));
      if (material?.kind !== "difficulty-session" || material.payload.part !== part || material.payload.level !== level) throw new Error(`Invalid session: Part ${part}, Level ${level}`);
      return material;
    });
    const items = sessions.flatMap((material) => material.payload.items);
    const itemIds = new Set();
    for (const item of items) {
      if (!item.id || item.part !== part || !Array.isArray(item.questions) || item.questions.length === 0) throw new Error(`Invalid practice item: Part ${part}`);
      if (itemIds.has(item.id)) throw new Error(`Duplicate practice item: Part ${part}, ${item.id}`);
      itemIds.add(item.id);
    }
    items.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const size = Math.floor(items.length / DAUTOEIC_DIFFICULTY_BANDS.length);
    const remainder = items.length % DAUTOEIC_DIFFICULTY_BANDS.length;
    let offset = 0;
    const levels = DAUTOEIC_DIFFICULTY_BANDS.map(({ level }, index) => {
      const original = levelsMaterial.payload.find((entry) => entry.level === level);
      if (!original) throw new Error(`Missing level: Part ${part}, Level ${level}`);
      const total = size + Number(index < remainder);
      const groupItems = items.slice(offset, offset + total).map((item) => ({ ...item, sourceLevel: item.sourceLevel ?? item.level, level }));
      offset += total;
      const title = `Nhóm luyện tập ${level}`;
      const session = sessions[index];
      replacements.set(session.key, { ...session, payload: { ...session.payload, grouping: "balanced", title, total, items: groupItems } });
      const rates = groupItems.filter((item) => item.totalAttempts > 0 && Number.isFinite(item.errorRate)).map((item) => item.errorRate);
      return {
        ...original, grouping: "balanced", title, total, itemIds: groupItems.map((item) => item.id),
        done: 0, correct: 0, wrong: 0, remaining: total,
        totalAttempts: groupItems.reduce((sum, item) => sum + (item.totalAttempts ?? 0), 0),
        wrongAttempts: groupItems.reduce((sum, item) => sum + (item.wrongCount ?? 0), 0),
        errorRateMin: rates.length ? Math.min(...rates) : null,
        errorRateMax: rates.length ? Math.max(...rates) : null,
      };
    });
    replacements.set(levelsKey, { ...levelsMaterial, payload: levels });
  }

  return {
    ...snapshot,
    practiceGrouping: { version: 1, method: "balanced", parts: [...BALANCED_PRACTICE_PARTS], ordering: "item-id" },
    materials: snapshot.materials.map((material) => replacements.get(material.key) ?? material),
  };
}
