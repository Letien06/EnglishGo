import { DAUTOEIC_DIFFICULTY_BANDS, DAUTOEIC_SOURCE_VERSION } from "../../src/lib/services/dautoeic-source.ts";

const key = (...parts) => [DAUTOEIC_SOURCE_VERSION, ...parts].join("__");
const questionParts = new Set([1, 2, 5]);
const text = (value) => value == null ? null : String(value).trim() || null;
const number = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const integer = (value) => number(value) == null ? null : Math.trunc(number(value));
function unique(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Invalid ${label} response.`);
  const ids = new Set();
  for (const row of rows) {
    if (!text(row.id) || ids.has(text(row.id))) throw new Error(`Missing or duplicate ${label} identity.`);
    ids.add(text(row.id));
  }
}
function fields(row, names, numeric = [], boolean = []) {
  return Object.fromEntries(Object.entries(names).map(([target, source]) => [target,
    numeric.includes(target) ? integer(row[source]) : boolean.includes(target) ? typeof row[source] === "boolean" ? row[source] : null : text(row[source])]));
}
function media(folder, file, base, version) {
  const clean = text(file);
  if (!clean || /^https?:\/\//i.test(clean)) return clean;
  const encodePath = (value) => value.split("/").filter(Boolean).map((segment) => {
    try { segment = decodeURIComponent(segment); } catch { /* Preserve literal malformed escape characters. */ }
    return encodeURIComponent(segment);
  }).join("/");
  const origin = new URL(base).origin;
  const versioned = (url) => version ? `${url}?v=${version}` : url;
  if (/^\/?storage\//.test(clean)) return versioned(origin + "/" + encodePath(clean));
  if (/^\/?mock-test-media\//.test(clean)) return versioned(origin + "/storage/v1/object/public/" + encodePath(clean));
  if (!text(folder)) throw new Error("Relative practice media lacks authorized test folder metadata.");
  return versioned(base.replace(/\/+$/, "") + "/" + encodePath(folder + "/" + clean));
}
const questionOrder = (a, b) => (a.questionNumber ?? a.orderIndex ?? 0) - (b.questionNumber ?? b.orderIndex ?? 0) || a.id.localeCompare(b.id);
const passageOrder = (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id);
const testFields = { id: "id", setId: "set_id", name: "name", description: "description", source: "source", year: "year", difficultyLevel: "difficulty_level", totalQuestions: "total_questions", listeningDurationSeconds: "listening_duration_seconds", readingDurationSeconds: "reading_duration_seconds", isFree: "is_free", isHidden: "is_hidden", orderIndex: "order_index", mediaFolder: "media_folder", mediaVersion: "media_version" };
const questionFields = { id: "id", testId: "test_id", passageId: "passage_id", part: "part", section: "section", questionNumber: "question_number", passageText: "passage_text", questionText: "question_text", optionA: "option_a", optionB: "option_b", optionC: "option_c", optionD: "option_d", correctAnswer: "correct_answer", explanationVi: "explanation_vi", explanationEn: "explanation_en", difficultyLevel: "difficulty_level", orderIndex: "order_index", translationVi: "dich_nghia", vocabulary: "tu_vung", answerTranslationVi: "dich_nghia_dap_an" };
const passageFields = { id: "id", testId: "test_id", part: "part", passageType: "passage_type", passageText: "passage_text", passageText2: "passage_text_2", passageText3: "passage_text_3", transcript: "transcript", orderIndex: "order_index", title: "title" };
function levelOf(value) {
  const level = integer(value) ?? 1;
  if (level < 1 || level > 4) throw new Error("Invalid source difficulty level.");
  return level;
}
function title(level) {
  return `Level ${level} — ${DAUTOEIC_DIFFICULTY_BANDS.find((entry) => entry.level === level).label}`;
}
export function levelsForItems(part, sessions, previous = []) {
  return DAUTOEIC_DIFFICULTY_BANDS.map(({ level }) => {
    const old = previous.find((entry) => entry.level === level);
    const items = sessions.find((entry) => entry.level === level).items;
    const rates = items.map((item) => item.errorRate).filter((value) => Number.isFinite(value));
    return { ...old, part, level, title: old?.title ?? title(level), errorRateMin: rates.length ? Math.min(...rates) : null,
      errorRateMax: rates.length ? Math.max(...rates) : null, total: items.length, itemIds: items.map((item) => item.id),
      done: 0, correct: 0, wrong: 0, remaining: items.length,
      totalAttempts: items.reduce((sum, item) => sum + (item.totalAttempts ?? 0), 0),
      wrongAttempts: items.reduce((sum, item) => sum + (item.wrongCount ?? 0), 0) };
  });
}

/** Stateless mapper matching the runtime source fields; IDs remain source IDs.
 * @param {object} rows
 * @param {string} mediaBase
 * @param {{ archivedTests?: Array<{id: string, mediaFolder?: string | null, difficultyLevel?: number | null}> }} options
 */
export function mapAuthorizedPracticeRows({ sets, tests, questions, passages, statsByPart, mediaTests = [] }, mediaBase, { archivedTests = [] } = {}) {
  unique(sets, "sets"); unique(tests, "tests"); unique(questions, "questions"); unique(passages, "passages");
  const mappedSets = sets.map((row) => fields(row, { id: "id", name: "name", description: "description", orderIndex: "order_index" }, ["orderIndex"]));
  const setsById = new Map(mappedSets.map((row) => [row.id, row]));
  const mappedTests = tests.map((row) => ({ ...fields(row, testFields, ["year", "difficultyLevel", "totalQuestions", "listeningDurationSeconds", "readingDurationSeconds", "orderIndex", "mediaVersion"], ["isFree", "isHidden"]),
    setName: text(row.mock_test_sets?.name) ?? setsById.get(text(row.set_id))?.name ?? null }));
  unique(mediaTests, "media tests");
  const testsById = new Map([...archivedTests, ...mappedTests].map((row) => [row.id, row]));
  for (const row of mediaTests) {
    const test = testsById.get(row.id);
    if (!test?.mediaFolder) testsById.set(row.id, { ...test, id: row.id, mediaFolder: text(row.media_folder), mediaVersion: integer(row.media_version) });
  }
  const visibleTests = mappedTests.filter((row) => row.isHidden !== true);
  if (!visibleTests.length) throw new Error("Authorized test catalog is empty.");
  const mappedQuestions = questions.map((row) => {
    const value = fields(row, questionFields, ["part", "questionNumber", "difficultyLevel", "orderIndex"]);
    const test = testsById.get(value.testId);
    return { ...value, audioUrl: media(test?.mediaFolder, row.audio_url, mediaBase, test?.mediaVersion), imageUrl: media(test?.mediaFolder, row.image_url, mediaBase, test?.mediaVersion) };
  });
  const mappedPassages = passages.map((row) => {
    const value = fields(row, passageFields, ["part", "orderIndex"]);
    const test = testsById.get(value.testId);
    return { ...value, audioUrl: media(test?.mediaFolder, row.audio_url, mediaBase, test?.mediaVersion), imageUrl: media(test?.mediaFolder, row.image_url, mediaBase, test?.mediaVersion) };
  });
  const passageById = new Map(mappedPassages.map((row) => [row.id, row]));
  for (const question of mappedQuestions) {
    if (!Number.isInteger(question.part) || question.part < 1 || question.part > 7 || !/^[A-D]$/.test(question.correctAnswer ?? "")) throw new Error("Invalid source question part or answer.");
    if (!questionParts.has(question.part) && question.passageId) {
      const passage = passageById.get(question.passageId);
      if (!passage || passage.part !== question.part || passage.testId !== question.testId) throw new Error("Question references an unavailable or mismatched passage.");
    }
  }
  for (const passage of mappedPassages) {
    if (!Number.isInteger(passage.part) || passage.part < 1 || passage.part > 7) throw new Error("Invalid source passage membership.");
  }
  const materials = [];
  const add = (name, kind, payload) => materials.push({ key: name, kind, payload });
  add(key("sets", "all"), "sets", mappedSets);
  add(key("tests", "all"), "tests", visibleTests);
  for (const test of visibleTests) {
    const testQuestions = mappedQuestions.filter((question) => question.testId === test.id);
    if (!Number.isInteger(test.totalQuestions) || test.totalQuestions <= 0 || testQuestions.length !== test.totalQuestions) throw new Error(`Incomplete authorized test: ${test.id}.`);
    add(key("test", test.id), "test", test);
    for (let part = 1; part <= 7; part++) add(key("test-part", test.id, part), "test-part", {
      test, part, skill: part <= 4 ? "listening" : "reading",
      passages: mappedPassages.filter((passage) => passage.testId === test.id && passage.part === part).sort(passageOrder),
      questions: testQuestions.filter((question) => question.part === part).sort(questionOrder),
    });
  }
  let retiredStats = 0, omittedEmptyPracticePassages = 0;
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    const statRows = statsByPart[part];
    if (!Array.isArray(statRows)) throw new Error(`Missing authorized practice stats: Part ${part}.`);
    const available = questionParts.has(part) ? mappedQuestions.filter((row) => row.part === part) : mappedPassages.filter((row) => row.part === part);
    const byId = new Map(available.map((row) => [row.id, row]));
    const stats = new Map();
    for (const row of statRows) {
      if (row.part != null && Number(row.part) !== part) throw new Error("Practice stats returned another part.");
      const id = text(row.item_id);
      if (!id) throw new Error("Practice stats has no item identity.");
      if (stats.has(id)) throw new Error("Duplicate practice stats identity.");
      if (!byId.has(id)) { retiredStats++; continue; }
      stats.set(id, row);
    }
    const sessions = DAUTOEIC_DIFFICULTY_BANDS.map(({ level }) => ({ part, level, title: title(level), total: 0, items: [] }));
    for (const row of available) {
      const stat = stats.get(row.id);
      const itemQuestions = questionParts.has(part) ? [row] : mappedQuestions.filter((question) => question.passageId === row.id && question.part === part).sort(questionOrder);
      if (!itemQuestions.length) { omittedEmptyPracticePassages++; continue; }
      const level = levelOf(stat?.difficulty_level ?? row.difficultyLevel ?? itemQuestions[0].difficultyLevel ?? testsById.get(row.testId)?.difficultyLevel);
      const transcript = questionParts.has(part) ? row.passageText ?? row.questionText : [...new Set([row.transcript, row.passageText, row.passageText2, row.passageText3].filter(Boolean))].join("\n\n") || null;
      const item = { id: row.id, itemType: text(stat?.item_type) ?? (questionParts.has(part) ? "question" : "passage"), part, level, sourceLevel: level,
        errorRate: number(stat?.error_rate), totalAttempts: integer(stat?.total_attempts), wrongCount: integer(stat?.wrong_count),
        audioUrl: row.audioUrl, imageUrl: row.imageUrl, transcript,
        translation: itemQuestions.find((question) => question.translationVi)?.translationVi ?? null,
        vocabulary: itemQuestions.find((question) => question.vocabulary)?.vocabulary ?? null, questions: itemQuestions };
      sessions.find((session) => session.level === level).items.push(item);
    }
    for (const session of sessions) {
      session.total = session.items.length;
      add(key(skill, "session", part, session.level, "all"), "difficulty-session", session);
    }
    add(key(skill, "levels", part), "difficulty-levels", levelsForItems(part, sessions));
  }
  return { materials, report: { sourceTests: visibleTests.length, sourceQuestions: mappedQuestions.length, sourcePassages: mappedPassages.length, retiredStats, omittedEmptyPracticePassages } };
}

/** Preserve every archived nonempty value; fill gaps without replacing stable identities. */
export function fillArchived(old, incoming) {
  if (old == null || old === "") return incoming ?? old;
  if (incoming == null) return old;
  if (Array.isArray(old)) {
    if (!Array.isArray(incoming)) throw new Error("Archived payload type changed.");
    if (!old.length) return incoming;
    if ([...old, ...incoming].every((row) => row && typeof row === "object" && text(row.id))) return mergeRows(old, incoming);
    return old;
  }
  if (typeof old === "object") {
    if (typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("Archived payload type changed.");
    return Object.fromEntries([...new Set([...Object.keys(old), ...Object.keys(incoming)])].map((field) => [field, fillArchived(old[field], incoming[field])]));
  }
  return old;
}
function mergeRows(old, incoming) {
  unique(old, "archived rows"); unique(incoming, "incoming rows");
  const rows = new Map(old.map((row) => [row.id, row]));
  for (const row of incoming) {
    const archived = rows.get(row.id);
    if (archived) for (const field of ["part", "testId", "passageId"]) {
      if (archived[field] != null && row[field] != null && archived[field] !== row[field]) throw new Error("Source identity changed archived membership.");
    }
    rows.set(row.id, fillArchived(archived, row));
  }
  return [...rows.values()];
}

export function mergeAuthorizedPracticeSnapshot(base, incoming, syncedAt) {
  if (!Number.isFinite(Date.parse(syncedAt))) throw new Error("Invalid source synchronization time.");
  base = structuredClone(base);
  const materials = new Map(base.materials.map((material) => [material.key, material]));
  const fresh = new Map(incoming.materials.map((material) => [material.key, material]));
  if (materials.size !== base.materials.length || fresh.size !== incoming.materials.length) throw new Error("Duplicate material identities.");
  for (const material of incoming.materials) {
    if (["difficulty-session", "difficulty-levels"].includes(material.kind)) continue;
    const old = materials.get(material.key);
    if (old && old.kind !== material.kind) throw new Error("Material kind changed.");
    const payload = fillArchived(old?.payload, material.payload);
    materials.set(material.key, old && JSON.stringify(payload) === JSON.stringify(old.payload) ? old : { ...old, ...material, payload, syncedAt });
  }
  const tests = materials.get(key("tests", "all")).payload;
  for (const test of tests) {
    const count = Array.from({ length: 7 }, (_, index) => materials.get(key("test-part", test.id, index + 1))?.payload?.questions?.length ?? NaN).reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(count)) throw new Error("Archived test parts are incomplete.");
    if (count !== test.totalQuestions) test.totalQuestions = count;
    const detail = materials.get(key("test", test.id));
    if (!detail) throw new Error("Missing archived test details.");
    // Keep catalog/detail/part totals consistent while retaining all old questions.
    if (detail.payload.totalQuestions !== count) materials.set(detail.key, { ...detail, payload: { ...detail.payload, totalQuestions: count }, syncedAt });
    for (let part = 1; part <= 7; part++) {
      const material = materials.get(key("test-part", test.id, part));
      if (material.payload.test.totalQuestions !== count) materials.set(material.key, { ...material, payload: { ...material.payload, test: { ...material.payload.test, totalQuestions: count } }, syncedAt });
    }
  }
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    const sessions = DAUTOEIC_DIFFICULTY_BANDS.map(({ level }) => {
      const name = key(skill, "session", part, level, "all");
      const old = materials.get(name);
      if (!old || old.payload.part !== part || old.payload.level !== level) throw new Error("Missing or mismatched archived practice session.");
      return { ...old.payload, items: [...old.payload.items] };
    });
    const oldLocations = new Map();
    for (const session of sessions) for (const item of session.items) {
      if (oldLocations.has(item.id)) throw new Error("Duplicate archived item across groups.");
      oldLocations.set(item.id, session.level);
    }
    for (const { level } of DAUTOEIC_DIFFICULTY_BANDS) {
      const incomingSession = fresh.get(key(skill, "session", part, level, "all"))?.payload;
      if (!incomingSession) throw new Error("Incomplete authorized practice sessions.");
      for (const item of incomingSession.items) {
        const targetLevel = oldLocations.get(item.id) ?? level;
        const target = sessions.find((session) => session.level === targetLevel);
        const index = target.items.findIndex((old) => old.id === item.id);
        if (index < 0) { target.items.push({ ...item, level: targetLevel }); oldLocations.set(item.id, targetLevel); }
        else target.items[index] = { ...fillArchived(target.items[index], item), level: targetLevel };
      }
    }
    for (const session of sessions) {
      session.total = session.items.length;
      const name = key(skill, "session", part, session.level, "all");
      const old = materials.get(name);
      materials.set(name, JSON.stringify(old.payload) === JSON.stringify(session) ? old : { ...old, payload: session, syncedAt });
    }
    const name = key(skill, "levels", part), old = materials.get(name);
    const levels = levelsForItems(part, sessions, old.payload);
    materials.set(name, JSON.stringify(old.payload) === JSON.stringify(levels) ? old : { ...old, payload: levels, syncedAt });
  }
  return { ...base, syncedAt, materials: [...materials.values()] };
}
