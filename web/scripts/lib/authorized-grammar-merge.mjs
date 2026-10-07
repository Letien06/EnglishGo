import { fillArchived } from "./authorized-practice-merge.mjs";

const source = "https://dauenglish.com";
const id = (value) => value == null ? "" : String(value).trim();
const text = (value) => value == null ? null : String(value).trim() || null;
const order = (value) => value == null ? null : Number.isInteger(Number(value)) ? Number(value) : null;
function unique(rows) {
  const ids = new Set();
  for (const row of rows) { if (!id(row.id) || ids.has(id(row.id))) throw new Error("Invalid or duplicate grammar source identity."); ids.add(id(row.id)); }
}
export function mapAuthorizedGrammarRows(rows, syncedAt) {
  if (!Number.isFinite(Date.parse(syncedAt))) throw new Error("Invalid grammar synchronization date.");
  for (const name of ["topics", "subtopics", "questions"]) { if (!Array.isArray(rows[name])) throw new Error("Invalid grammar source rows."); unique(rows[name]); }
  const provenance = { version: 1, source, accessScope: "provider-authorized", syncedAt };
  const topicRows = rows.topics.filter((row) => row.is_hidden !== true);
  const topics = [], details = [];
  for (const row of topicRows) {
    const topicId = id(row.id);
    const subtopics = rows.subtopics.filter((sub) => id(sub.topic_id) === topicId && sub.is_hidden !== true)
      .sort((a, b) => (order(a.order_index) ?? 0) - (order(b.order_index) ?? 0) || id(a.id).localeCompare(id(b.id)))
      .map((sub) => ({ id: id(sub.id), slug: id(sub.slug), title: text(sub.title_vi) ?? id(sub.slug), orderIndex: order(sub.order_index), accessLevel: sub.access_level === "pro" ? "pro" : "free", questionCount: 0 }));
    const subIds = new Set(subtopics.map((sub) => sub.id));
    const questions = rows.questions.filter((question) => id(question.topic_id) === topicId && subIds.has(id(question.subtopic_id)))
      .map((question) => {
        if (!/^[A-D]$/.test(id(question.correct_answer)) || !text(question.question_text)) throw new Error("Invalid authorized grammar question or answer.");
        return { id: id(question.id), topicId, subtopicId: id(question.subtopic_id), text: text(question.question_text), options: Object.fromEntries(["A", "B", "C", "D"].map((letter) => [letter, text(question[`option_${letter.toLowerCase()}`])])), answer: id(question.correct_answer), explanation: text(question.explanation_vi), translation: text(question.translation_vi), vocabulary: question.vocabulary ?? null, orderIndex: order(question.order_index) };
      }).sort((a, b) => subtopics.findIndex((sub) => sub.id === a.subtopicId) - subtopics.findIndex((sub) => sub.id === b.subtopicId) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));
    if (!questions.length) continue;
    for (const sub of subtopics) sub.questionCount = questions.filter((question) => question.subtopicId === sub.id).length;
    topics.push({ id: topicId, slug: id(row.slug), title: text(row.title_vi) ?? id(row.slug), bigTopic: text(row.big_topic), orderIndex: order(row.order_index), questionCount: questions.length, subtopics });
    details.push({ key: `dauenglish-v2__grammar__topic__${topicId}`, kind: "grammar-topic", payload: { ...provenance, topicId, questions }, syncedAt });
  }
  if (!topics.length) throw new Error("No playable authorized grammar topics.");
  topics.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));
  return [{ key: "dauenglish-v2__grammar__catalog", kind: "grammar-catalog", payload: { ...provenance, topics }, syncedAt }, ...details];
}
export function mergeAuthorizedGrammarSnapshot(base, rows, syncedAt) {
  const result = structuredClone(base), materials = new Map(result.materials.map((material) => [material.key, material]));
  for (const material of mapAuthorizedGrammarRows(rows, syncedAt)) {
    const previous = materials.get(material.key);
    if (previous && previous.kind !== material.kind) throw new Error("Archived grammar material kind changed.");
    materials.set(material.key, { ...material, payload: fillArchived(previous?.payload, material.payload), syncedAt });
  }
  const catalog = materials.get("dauenglish-v2__grammar__catalog");
  for (const topic of catalog.payload.topics) {
    const detail = materials.get(`dauenglish-v2__grammar__topic__${topic.id}`);
    if (!detail) throw new Error("Missing archived grammar topic.");
    topic.questionCount = detail.payload.questions.length;
    for (const subtopic of topic.subtopics) subtopic.questionCount = detail.payload.questions.filter((question) => question.subtopicId === subtopic.id).length;
  }
  return { ...result, syncedAt, materials: [...materials.values()] };
}
