import { describe, expect, it, vi } from "vitest";
import { buildDrivePackage } from "../../scripts/lib/drive-package.mjs";
import { mapAuthorizedPracticeRows, mergeAuthorizedPracticeSnapshot } from "../../scripts/lib/authorized-practice-merge.mjs";
import { fetchAuthorizedPracticeRows, fetchMissingPracticeMediaMetadata, createPracticeCheckpoint, readPracticeCheckpoint } from "../../scripts/lib/authorized-practice-source.mjs";
import { vocabularyFixture } from "../test/vocabulary-fixture";

const key = (...parts: Array<string | number>) => ["dauenglish-v2", ...parts].join("__");
const mediaBase = "https://source.example.test/media";
function sourceFixture(testId = "test-a") {
  const questions = Array.from({ length: 7 }, (_, index) => {
    const part = index + 1;
    return { id: `${testId}-q${part}`, test_id: testId, passage_id: [3, 4, 6, 7].includes(part) ? `${testId}-p${part}` : null,
      part, question_number: part, question_text: "Original prompt", option_a: "Yes", option_b: "No", correct_answer: "A",
      difficulty_level: 2, audio_url: part <= 4 ? "audio 1.mp3" : null, image_url: null, dich_nghia: null, tu_vung: null };
  });
  const passages = [3, 4, 6, 7].map((part) => ({ id: `${testId}-p${part}`, test_id: testId, part, passage_text: "Original passage", passage_text_2: "Second text", transcript: null, audio_url: part <= 4 ? "passage.mp3" : null }));
  return { sets: [{ id: "set-a", name: "Bộ đề", order_index: 1 }],
    tests: [{ id: testId, set_id: "set-a", name: testId, total_questions: 7, difficulty_level: 2, is_free: false, is_hidden: false, media_folder: "Đề thi" }],
    questions, passages, statsByPart: Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
      const part = index + 1;
      return [part, [{ item_id: [3, 4, 6, 7].includes(part) ? `${testId}-p${part}` : `${testId}-q${part}`, part, difficulty_level: 2, total_attempts: 10, wrong_count: 3, error_rate: 0.3 }]];
    })) };
}
function snapshotFixture() {
  return { source: "https://dauenglish.com", sourceVersion: "dauenglish-v2", syncedAt: "2026-10-01T00:00:00.000Z", materials: mapAuthorizedPracticeRows(sourceFixture(), mediaBase).materials };
}
describe("authorized incremental practice mapping and preservation", () => {
  it("resolves provider storage paths, bucket paths, encoded filenames and source versions", () => {
    const rows = sourceFixture();
    Object.assign(rows.tests[0], { media_version: 3 });
    rows.questions[0].audio_url = "/storage/v1/object/public/mock-test-media/Test%2001/audio.mp3";
    rows.questions[1].audio_url = "mock-test-media/Test%2002/audio.mp3";
    rows.questions[2].audio_url = "already%20encoded.mp3";
    const mapped = mapAuthorizedPracticeRows(rows, mediaBase);
    const questions = mapped.materials.filter((material: { kind: string }) => material.kind === "test-part").flatMap((material: { payload: { questions: Array<{ audioUrl: string }> } }) => material.payload.questions);
    expect(questions[0].audioUrl).toBe("https://source.example.test/storage/v1/object/public/mock-test-media/Test%2001/audio.mp3?v=3");
    expect(questions[1].audioUrl).toBe("https://source.example.test/storage/v1/object/public/mock-test-media/Test%2002/audio.mp3?v=3");
    expect(questions[2].audioUrl).toBe(`${mediaBase}/%C4%90%E1%BB%81%20thi/already%20encoded.mp3?v=3`);
  });
  it("uses authorized auxiliary folders without exposing tests and prefers source catalog folders", () => {
    const rows = sourceFixture();
    rows.questions.push({ ...rows.questions[0], id: "retired-question", test_id: "retired" });
    const mapped = mapAuthorizedPracticeRows({ ...rows, mediaTests: [{ id: "retired", media_folder: "Authorized folder" }, { id: "test-a", media_folder: "Wrong fallback" }] }, mediaBase);
    const items = mapped.materials.find((material: { key: string }) => material.key === key("listening", "session", 1, 2, "all")).payload.items;
    expect(items[0].audioUrl).toContain("%C4%90%E1%BB%81%20thi");
    expect(items[1].audioUrl).toBe(`${mediaBase}/Authorized%20folder/audio%201.mp3`);
    expect(mapped.report.sourceTests).toBe(1);
    expect(() => mapAuthorizedPracticeRows(rows, mediaBase)).toThrow("Relative practice media lacks");
  });
  it("batches only missing relative-media test IDs through the official authorized RPC", async () => {
    const rows = sourceFixture();
    rows.questions.push(...Array.from({ length: 101 }, (_, index) => ({ ...rows.questions[0], id: `extra-${index}`, test_id: `retired-${index}` })));
    rows.questions.push({ ...rows.questions[0], id: "absolute", test_id: "absolute-test", audio_url: "https://source.example.test/audio.mp3" });
    const request = vi.fn(async (_path: string, options: { body: { p_test_ids: string[] } }) => ({ data: options.body.p_test_ids.map((id) => ({ id, media_folder: `folder/${id}`, extra: "excluded" })) }));
    const media = await fetchMissingPracticeMediaMetadata({ request }, rows);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe("/rest/v1/rpc/get_mock_test_media_batch");
    expect(request.mock.calls[0][1].body.p_test_ids).toHaveLength(100);
    expect(request.mock.calls[1][1].body.p_test_ids).toHaveLength(1);
    expect(media).toHaveLength(101);
    expect(media.every((row: object) => Object.keys(row).sort().join() === "id,media_folder")).toBe(true);
  });
  it("omits unplayable orphan passages from fresh practice while retaining playable and archived items", () => {
    const base = snapshotFixture();
    const rows = sourceFixture("test-b");
    rows.passages.push({ ...rows.passages[0], id: "orphan", test_id: "retired-test", audio_url: null });
    rows.statsByPart[3].push({ ...rows.statsByPart[3][0], item_id: "orphan" });
    const incoming = mapAuthorizedPracticeRows(rows, mediaBase);
    expect(incoming.report.omittedEmptyPracticePassages).toBe(1);
    const merged = mergeAuthorizedPracticeSnapshot(base, incoming, "2026-10-08T00:00:00.000Z");
    const session = merged.materials.find((material: { key: string }) => material.key === key("listening", "session", 3, 2, "all")).payload;
    expect(session.items.map((item: { id: string }) => item.id)).toEqual(["test-a-p3", "test-b-p3"]);
    expect(session.items.every((item: { questions: unknown[] }) => item.questions.length > 0)).toBe(true);
    expect(buildDrivePackage(JSON.stringify(merged)).counts.questions).toBe(14);
  });
  it("orders passage questions and test passages by runtime display fields and normalizes repeated media separators", () => {
    const rows = sourceFixture();
    rows.tests[0].total_questions = 10;
    rows.tests[0].media_folder = "/Old//folder/";
    rows.questions[2].question_number = 30;
    rows.questions[2].audio_url = "/nested//audio.mp3";
    rows.questions.push(
      { ...rows.questions[2], id: "z-first", question_number: 10 },
      { ...rows.questions[2], id: "a-second", question_number: 20 },
      { ...rows.questions[2], id: "other-passage-question", question_number: 40, passage_id: "other-passage" },
    );
    Object.assign(rows.passages[0], { order_index: 20 });
    rows.passages.push({ ...rows.passages[0], id: "other-passage", order_index: 10 } as typeof rows.passages[number]);
    const mapped = mapAuthorizedPracticeRows(rows, mediaBase);
    const session = mapped.materials.find((material: { key: string }) => material.key === key("listening", "session", 3, 2, "all")).payload;
    const passage = session.items.find((item: { id: string }) => item.id === "test-a-p3");
    expect(passage.questions.map((question: { id: string }) => question.id)).toEqual(["z-first", "a-second", "test-a-q3"]);
    expect(passage.questions[0].audioUrl).toBe(`${mediaBase}/Old/folder/nested/audio.mp3`);
    const testPart = mapped.materials.find((material: { key: string }) => material.key === key("test-part", "test-a", 3)).payload;
    expect(testPart.passages.map((item: { id: string }) => item.id)).toEqual(["other-passage", "test-a-p3"]);
    expect(testPart.questions.map((question: { id: string }) => question.id)).toEqual(["z-first", "a-second", "test-a-q3", "other-passage-question"]);
  });
  it("retains standalone and retired-test practice with archived media metadata", () => {
    const rows = sourceFixture();
    const retired = sourceFixture("retired");
    rows.questions.push(...retired.questions);
    rows.passages.push(...retired.passages);
    rows.questions.push({ ...retired.questions[0], id: "standalone", test_id: null as unknown as string, audio_url: "https://source.example.test/standalone.mp3" });
    const mapped = mapAuthorizedPracticeRows(rows, mediaBase, { archivedTests: [{ id: "retired", mediaFolder: "Old folder" }] });
    const items = mapped.materials.find((material: { key: string }) => material.key === key("listening", "session", 1, 2, "all")).payload.items;
    expect(items.map((item: { id: string }) => item.id)).toEqual(["test-a-q1", "retired-q1", "standalone"]);
    expect(items[1].audioUrl).toBe(`${mediaBase}/Old%20folder/audio%201.mp3`);
    expect(mapped.report.sourceTests).toBe(1);
    const testPart = mapped.materials.find((material: { key: string }) => material.key === key("test-part", "test-a", 1)).payload;
    expect(testPart.questions).toHaveLength(1);
  });
  it("validates credential-free source checkpoints before reuse", () => {
    const source = { rows: sourceFixture(), httpDate: "Thu, 08 Oct 2026 00:00:00 GMT" };
    const checkpoint = createPracticeCheckpoint("base-hash", source);
    expect(readPracticeCheckpoint(checkpoint, "base-hash")).toEqual(source);
    expect(Object.keys(checkpoint).sort()).toEqual(["baseSha256", "format", "httpDate", "rows", "rowsSha256", "source"]);
    expect(() => readPracticeCheckpoint(checkpoint, "other-base")).toThrow();
    const altered = structuredClone(checkpoint);
    altered.rows.questions.pop();
    expect(() => readPracticeCheckpoint(altered, "base-hash")).toThrow();
    const incomplete = createPracticeCheckpoint("base-hash", { ...source, rows: { ...source.rows, statsByPart: {} } });
    expect(() => readPracticeCheckpoint(incomplete, "base-hash")).toThrow();
  });
  it("maps all seven parts, media filenames, bilingual fields, passage texts and source scoring IDs", () => {
    const rows = sourceFixture();
    Object.assign(rows.questions[4], { dich_nghia: "Dịch nghĩa", tu_vung: '{"vocabulary":[]}', dich_nghia_dap_an: "A. Đúng", explanation_vi: "Giải thích" });
    const mapped = mapAuthorizedPracticeRows(rows, mediaBase);
    expect(mapped.report).toMatchObject({ sourceTests: 1, sourceQuestions: 7, sourcePassages: 4 });
    const part = mapped.materials.find((material: { key: string }) => material.key === key("test-part", "test-a", 1)).payload;
    expect(part.questions[0]).toMatchObject({ id: "test-a-q1", audioUrl: "https://source.example.test/media/%C4%90%E1%BB%81%20thi/audio%201.mp3" });
    const session = mapped.materials.find((material: { key: string }) => material.key === key("reading", "session", 5, 2, "all")).payload;
    expect(session.items[0]).toMatchObject({ id: "test-a-q5", sourceLevel: 2, questions: [expect.objectContaining({ translationVi: "Dịch nghĩa", answerTranslationVi: "A. Đúng", explanationVi: "Giải thích" })] });
    const passage = mapped.materials.find((material: { key: string }) => material.key === key("reading", "session", 7, 2, "all")).payload;
    expect(passage.items[0].transcript).toBe("Original passage\n\nSecond text");
  });
  it("adds Pro test/questions while preserving vocabulary, archived tests, payload fields and material IDs", () => {
    const base = snapshotFixture();
    const vocabulary = { key: key("vocabulary", "all"), kind: "vocabulary", payload: vocabularyFixture(), syncedAt: base.syncedAt };
    base.materials.push(vocabulary);
    const baseBefore = JSON.stringify(base);
    const incoming = mapAuthorizedPracticeRows(sourceFixture("test-b"), mediaBase);
    const merged = mergeAuthorizedPracticeSnapshot(base, incoming, "2026-10-08T00:00:00.000Z");
    expect(JSON.stringify(base)).toBe(baseBefore);
    expect(merged.materials.find((material: { key: string }) => material.key === vocabulary.key)).toEqual(vocabulary);
    for (const original of base.materials.filter((material: { kind: string }) => ["test", "test-part"].includes(material.kind))) {
      expect(merged.materials.find((material: { key: string }) => material.key === original.key)).toEqual(original);
    }
    expect(buildDrivePackage(JSON.stringify(merged)).counts).toMatchObject({ tests: 2, questions: 14, materials: 54 });
  });
  it("fills formerly inaccessible fields without erasing rich archived fields", () => {
    const base = snapshotFixture();
    const part = base.materials.find((material: { key: string }) => material.key === key("test-part", "test-a", 5)).payload;
    part.questions[0].explanationVi = "Archived explanation";
    const rows = sourceFixture();
    Object.assign(rows.questions[4], { dich_nghia: "New authorized translation", explanation_vi: null, question_text: "Incoming different prompt" });
    const merged = mergeAuthorizedPracticeSnapshot(base, mapAuthorizedPracticeRows(rows, mediaBase), "2026-10-08T00:00:00.000Z");
    const question = merged.materials.find((material: { key: string }) => material.key === key("test-part", "test-a", 5)).payload.questions[0];
    expect(question).toMatchObject({ id: "test-a-q5", questionText: "Original prompt", explanationVi: "Archived explanation", translationVi: "New authorized translation" });
  });
  it("retains old balanced practice membership while appending new source items", () => {
    const base = snapshotFixture();
    const oldSession = base.materials.find((material: { key: string }) => material.key === key("listening", "session", 3, 2, "all")).payload;
    const target = base.materials.find((material: { key: string }) => material.key === key("listening", "session", 3, 1, "all")).payload;
    target.items = [{ ...oldSession.items[0], level: 1, sourceLevel: 2 }]; target.total = 1; oldSession.items = []; oldSession.total = 0;
    const rows = sourceFixture();
    const incoming = mapAuthorizedPracticeRows(rows, mediaBase);
    const merged = mergeAuthorizedPracticeSnapshot(base, incoming, "2026-10-08T00:00:00.000Z");
    const session = merged.materials.find((material: { key: string }) => material.key === key("listening", "session", 3, 1, "all")).payload;
    expect(session.items[0]).toMatchObject({ id: "test-a-p3", level: 1, sourceLevel: 2 });
    expect(buildDrivePackage(JSON.stringify(merged)).counts.questions).toBe(7);
  });
  it.each(["incomplete", "missing-passage", "duplicate-question", "wrong-part-stats", "bad-answer"] as const)("rejects %s source before producing a merged snapshot", (issue) => {
    const rows = sourceFixture();
    if (issue === "incomplete") rows.questions.pop();
    if (issue === "missing-passage") rows.passages.pop();
    if (issue === "duplicate-question") rows.questions.push(rows.questions[0]);
    if (issue === "wrong-part-stats") rows.statsByPart[3][0].part = 7;
    if (issue === "bad-answer") rows.questions[0].correct_answer = "X";
    expect(() => mapAuthorizedPracticeRows(rows, mediaBase)).toThrow();
  });
  it("imports accessible items without stats and reports retired stats rather than dropping new content", () => {
    const rows = sourceFixture();
    rows.statsByPart[1] = [{ ...rows.statsByPart[1][0], item_id: "retired-item" }];
    const mapped = mapAuthorizedPracticeRows(rows, mediaBase);
    expect(mapped.report.retiredStats).toBe(1);
    expect(mapped.materials.find((material: { key: string }) => material.key === key("listening", "session", 1, 2, "all")).payload.items[0].id).toBe("test-a-q1");
  });
});
describe("authorized practice source pagination", () => {
  it("follows exact table totals even if upstream returns fewer rows than requested and reads all seven RPC parts", async () => {
    const request = vi.fn(async (path: string, options: { params?: { offset?: string }; body?: { p_part: number } }) => {
      if (path.includes("/rpc/")) return { data: [], httpDate: "Thu, 08 Oct 2026 00:00:00 GMT", headers: new Headers() };
      const offset = Number(options.params?.offset);
      return { data: [{ id: `${path}-${offset}` }], httpDate: "Thu, 08 Oct 2026 00:00:00 GMT", headers: new Headers({ "content-range": `${offset}-${offset}/2` }) };
    });
    const result = await fetchAuthorizedPracticeRows({ request });
    expect(result.rows.tests).toHaveLength(2);
    expect(request.mock.calls.filter(([path]) => path.includes("/rpc/")).map(([, options]) => options.body?.p_part)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(request.mock.calls.filter(([path]) => !path.includes("/rpc/"))).toHaveLength(8);
  });
  it.each(["missing-count", "stalled-page", "changed-count"] as const)("rejects %s table pagination", async (issue) => {
    const request = vi.fn(async (_path: string, options: { params: { offset: string } }) => {
      const offset = Number(options.params.offset);
      return { data: issue === "stalled-page" ? [] : [{ id: offset }], headers: new Headers(issue === "missing-count" ? {} : { "content-range": `0-0/${issue === "changed-count" && offset ? 3 : 2}` }), httpDate: "Thu, 08 Oct 2026 00:00:00 GMT" };
    });
    await expect(fetchAuthorizedPracticeRows({ request })).rejects.toThrow();
  });
  it("propagates authorization denial without fallback or anonymous retry", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Authorized source HTTP 403"));
    await expect(fetchAuthorizedPracticeRows({ request })).rejects.toThrow(/403/);
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls.every((call) => !String(call[0]).includes("/rpc/"))).toBe(true);
  });
});
