import { vocabularySnapshotSchema } from "../../src/lib/storage/vocab-snapshot.ts";

const clean = value => String(value ?? "").trim();
const eligible = (test, authorized = false) => (authorized || clean(test.accessLevel).toLowerCase() !== "pro") && test.partCount > 0 && test.wordCount > 0;

export function vocabularySyncTimestamp(httpDate, fallbackNow = Date.now()) {
  const sourceTime = typeof httpDate === "string" ? Date.parse(httpDate) : NaN;
  const timestamp = Number.isFinite(sourceTime) && Math.abs(sourceTime) <= 8_640_000_000_000_000 ? sourceTime : fallbackNow;
  return new Date(timestamp).toISOString();
}

/** Public catalogue metadata only; this does not fetch any test content. */
export function parsePublicVocabularyCatalog(raw) {
  const rows = value => {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error("Invalid public vocabulary catalogue.");
    return parsed;
  };
  const catalog = {
    sets: rows(raw?.sets).map(row => ({ id: clean(row.id), name: row.name ?? null, orderIndex: row.order_index ?? null })),
    tests: rows(raw?.tests).map(row => ({ testId: clean(row.test_id), setId: clean(row.set_id), name: row.name ?? null,
      partCount: Number(row.part_count ?? 0), wordCount: Number(row.word_count ?? 0), orderIndex: row.order_index ?? null, accessLevel: row.access_level ?? null })),
  };
  for (const [rows, field] of [[catalog.sets, "id"], [catalog.tests, "testId"]]) {
    if (rows.some(row => !row[field]) || new Set(rows.map(row => row[field])).size !== rows.length) throw new Error("Duplicate or missing public vocabulary IDs.");
  }
  return catalog;
}

/** Keep previously archived free content and IDs; add only newly public content. */
export function mergeVocabularySnapshots(archivedValue, incomingValue, currentCatalog = incomingValue?.catalog, { authorized = false } = {}) {
  const archived = archivedValue ? vocabularySnapshotSchema.parse(archivedValue) : null;
  if (!incomingValue && (!authorized || !archived)) throw new Error("Missing incoming vocabulary snapshot.");
  if (authorized && incomingValue && incomingValue.accessScope !== "provider-authorized") throw new Error("Missing authorized vocabulary provenance.");
  const incoming = incomingValue ? vocabularySnapshotSchema.parse(incomingValue) : { catalog: { sets: [], tests: [] }, parts: [], words: [] };
  const retained = new Map((archived?.catalog.tests ?? []).map(test => [test.testId, test]));
  const currentById = new Map(currentCatalog.tests.map(test => [test.testId, test]));
  if (currentById.size !== currentCatalog.tests.length) throw new Error("Duplicate current vocabulary test IDs.");
  const incomingById = new Map(incoming.catalog.tests.map(test => [test.testId, test]));
  for (const test of incoming.catalog.tests) {
    const current = currentById.get(test.testId);
    if (!current || !eligible(current, authorized) || current.setId !== test.setId || current.partCount !== test.partCount || current.wordCount !== test.wordCount) throw new Error(`Current public vocabulary metadata mismatch: ${test.testId}`);
  }
  for (const test of currentCatalog.tests.filter(test => eligible(test, authorized))) {
    if (!incomingById.has(test.testId) && !(authorized && retained.has(test.testId))) throw new Error(`Missing current public vocabulary test: ${test.testId}`);
  }
  for (const test of retained.values()) {
    const current = currentById.get(test.testId);
    if (current && current.setId !== test.setId) throw new Error(`Vocabulary test group conflict: ${test.testId}`);
  }
  const additions = incoming.catalog.tests.filter(test => !retained.has(test.testId));
  const addedIds = new Set(additions.map(test => test.testId));
  const addedParts = incoming.parts.filter(part => addedIds.has(part.testId));
  const addedPartIds = new Set(addedParts.map(part => part.id));
  const addedWords = incoming.words.filter(word => addedPartIds.has(word.partId));
  const oldPartIds = new Set((archived?.parts ?? []).map(part => part.id));
  const oldWordIds = new Set((archived?.words ?? []).map(word => word.id));
  if (addedParts.some(part => oldPartIds.has(part.id)) || addedWords.some(word => oldWordIds.has(word.id))) throw new Error("New vocabulary content conflicts with archived IDs.");
  const sets = new Map(currentCatalog.sets.map(set => [set.id, set]));
  if (sets.size !== currentCatalog.sets.length) throw new Error("Duplicate current vocabulary group IDs.");
  for (const set of archived?.catalog.sets ?? []) if (!sets.has(set.id)) sets.set(set.id, set);
  const vocabulary = vocabularySnapshotSchema.parse({
    ...((authorized || archived?.accessScope === "provider-authorized") ? { accessScope: "provider-authorized" } : {}),
    catalog: { sets: [...sets.values()].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)), tests: [...retained.values(), ...additions] },
    parts: [...(archived?.parts ?? []), ...addedParts], words: [...(archived?.words ?? []), ...addedWords],
  });
  const groups = vocabulary.catalog.sets.map(set => ({
    id: set.id, name: set.name, orderIndex: set.orderIndex,
    availableTests: vocabulary.catalog.tests.filter(test => test.setId === set.id).length,
    retainedTests: [...retained.values()].filter(test => test.setId === set.id).length,
    addedTests: additions.filter(test => test.setId === set.id).length,
    currentFreeTests: currentCatalog.tests.filter(test => test.setId === set.id && eligible(test)).length,
    currentProTests: currentCatalog.tests.filter(test => test.setId === set.id && clean(test.accessLevel).toLowerCase() === "pro").length,
  }));
  if (authorized && currentCatalog.tests.some(test => !vocabulary.catalog.tests.some(stored => stored.testId === test.testId && stored.partCount === test.partCount && stored.wordCount === test.wordCount))) throw new Error("Authorized vocabulary catalogue is incomplete or archived counts have changed.");
  return { vocabulary, report: { addedTests: additions.length, retainedTests: retained.size, totalTests: vocabulary.catalog.tests.length, currentCatalogTests: currentCatalog.tests.length, groups } };
}

export function replaceVocabularyMaterial(materials, vocabulary, syncedAt) {
  const key = "dauenglish-v2__vocabulary__all";
  if (materials.filter(material => material.kind === "vocabulary").some(material => material.key !== key) || materials.some(material => material.key === key && material.kind !== "vocabulary") || materials.filter(material => material.key === key).length > 1) throw new Error("Unexpected or duplicate vocabulary material.");
  return [...materials.filter(material => material.key !== key), { key, kind: "vocabulary", syncedAt, payload: vocabulary }];
}
