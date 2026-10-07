import { practiceSourceHash } from "./authorized-practice-source.mjs";

const contentCatalog = (rows) => Array.isArray(rows) ? rows.map((topic) => ({ id: topic.id, slug: topic.slug, title: topic.title, big_topic: topic.big_topic,
  subtopics: Array.isArray(topic.subtopics) ? topic.subtopics.map((subtopic) => ({ id: subtopic.id, slug: subtopic.slug, title: subtopic.title, total: subtopic.total })) : [] })) : [];

export async function fetchAuthorizedGrammarRows(client) {
  let httpDate;
  async function table(name, params = {}) {
    const rows = []; let expected;
    for (let page = 0; page < 100; page++) {
      const result = await client.request(`/rest/v1/${name}`, { params: { select: "*", order: "id.asc", limit: "1000", offset: String(rows.length), ...params }, headers: { Prefer: "count=exact" } });
      const count = result.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
      const total = Number(count);
      if (!Array.isArray(result.data) || count === undefined || !Number.isSafeInteger(total) || total > 100_000 || (expected !== undefined && expected !== total)) throw new Error("Invalid authorized grammar pagination count.");
      expected = total; rows.push(...result.data); httpDate = result.httpDate ?? httpDate;
      if (rows.length > total || (result.data.length === 0 && rows.length < total)) throw new Error("Authorized grammar pagination stalled.");
      if (rows.length === total) return rows;
    }
    throw new Error("Authorized grammar pagination bound exceeded.");
  }
  const [topics, subtopics, catalogResult] = await Promise.all([
    table("grammar_topics"), table("grammar_subtopics"), client.request("/rest/v1/rpc/get_grammar_catalog", { method: "POST", body: {} }),
  ]);
  if (!topics.length) throw new Error("Authorized grammar topic catalog is empty.");
  const questions = [];
  for (let offset = 0; offset < topics.length; offset += 100) {
    const ids = topics.slice(offset, offset + 100).map((row) => String(row.id));
    if (ids.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id))) throw new Error("Invalid grammar topic identity.");
    questions.push(...await table("questions", { topic_id: `in.(${ids.join(",")})` }));
  }
  if (!Number.isFinite(Date.parse(httpDate))) throw new Error("Missing authorized grammar synchronization date.");
  return { rows: { topics, subtopics, questions, catalog: contentCatalog(catalogResult.data) }, httpDate };
}
export function grammarCheckpoint(source) {
  const rows = { ...source.rows, catalog: contentCatalog(source.rows.catalog) };
  return { format: "authorized-grammar-source-v1", source: "https://dauenglish.com", httpDate: source.httpDate, rowsSha256: practiceSourceHash(rows), rows };
}
export function readGrammarCheckpoint(value) {
  if (value?.format !== "authorized-grammar-source-v1" || value.source !== "https://dauenglish.com" || !Number.isFinite(Date.parse(value.httpDate)) || value.rowsSha256 !== practiceSourceHash(value.rows)
    || !["topics", "subtopics", "questions"].every((name) => Array.isArray(value.rows?.[name]))) throw new Error("Invalid authorized grammar checkpoint.");
  return { rows: { ...value.rows, catalog: contentCatalog(value.rows.catalog) }, httpDate: value.httpDate };
}
