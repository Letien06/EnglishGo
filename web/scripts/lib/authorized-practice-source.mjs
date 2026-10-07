import { createHash } from "node:crypto";

export const practiceSourceHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function fetchMissingPracticeMediaMetadata(client, rows) {
  const known = new Set(rows.tests.filter((row) => row.media_folder).map((row) => row.id));
  const ids = [...new Set([...rows.questions, ...rows.passages]
    .filter((row) => [row.audio_url, row.image_url].some((value) => typeof value === "string" && value.trim() && !/^https?:\/\//i.test(value.trim())))
    .map((row) => row.test_id).filter((id) => id && !known.has(id)))].sort();
  const mediaTests = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const result = await client.request("/rest/v1/rpc/get_mock_test_media_batch", { method: "POST", body: { p_test_ids: batch } });
    if (!Array.isArray(result.data)) throw new Error("Invalid authorized practice media metadata.");
    for (const row of result.data) {
      if (!batch.includes(row.id) || typeof row.media_folder !== "string" || !row.media_folder.trim() || mediaTests.some((old) => old.id === row.id)) throw new Error("Invalid authorized practice media identity or folder.");
      mediaTests.push({ id: row.id, media_folder: row.media_folder, ...(row.media_version != null ? { media_version: row.media_version } : {}) });
    }
  }
  return mediaTests;
}
export function createPracticeCheckpoint(baseSha256, { rows, httpDate }) {
  return { format: "authorized-practice-source-v1", source: "https://dauenglish.com", baseSha256, httpDate,
    rowsSha256: practiceSourceHash(rows), rows };
}
export function readPracticeCheckpoint(checkpoint, baseSha256) {
  if (checkpoint?.format !== "authorized-practice-source-v1" || checkpoint.source !== "https://dauenglish.com"
    || checkpoint.baseSha256 !== baseSha256 || !Number.isFinite(Date.parse(checkpoint.httpDate))
    || checkpoint.rowsSha256 !== practiceSourceHash(checkpoint.rows)
    || !["sets", "tests", "questions", "passages"].every((name) => Array.isArray(checkpoint.rows?.[name]))
    || (checkpoint.rows?.mediaTests !== undefined && !Array.isArray(checkpoint.rows.mediaTests))
    || !Array.from({ length: 7 }, (_, index) => index + 1).every((part) => Array.isArray(checkpoint.rows?.statsByPart?.[part]))) {
    throw new Error("Invalid or mismatched authorized practice checkpoint.");
  }
  return { rows: checkpoint.rows, httpDate: checkpoint.httpDate };
}

/** Paginate the authorized source with explicit total counts; never silently truncate. */
export async function fetchAuthorizedPracticeRows(client) {
  let httpDate;
  async function table(name, params = {}) {
    const rows = [];
    let expectedTotal;
    for (let page = 0; page < 100; page++) {
      const result = await client.request(`/rest/v1/${name}`, { params: { select: "*", order: "id.asc", limit: "1000", offset: String(rows.length), ...params }, headers: { Prefer: "count=exact" } });
      if (!Array.isArray(result.data)) throw new Error(`Invalid authorized ${name} rows.`);
      const count = result.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
      if (count === undefined) throw new Error(`Missing authorized ${name} total count.`);
      const total = Number(count);
      if (!Number.isSafeInteger(total) || total < 0 || total > 100_000 || (expectedTotal !== undefined && expectedTotal !== total)) throw new Error(`Authorized ${name} count changed or exceeded the import bound.`);
      expectedTotal = total;
      if (result.data.length > 1000 || (!result.data.length && rows.length < total)) throw new Error(`Authorized ${name} pagination did not advance.`);
      rows.push(...result.data);
      if (rows.length > total) throw new Error(`Authorized ${name} row count mismatch.`);
      if (rows.length === total) { if (result.httpDate) httpDate = result.httpDate; return rows; }
    }
    throw new Error("Authorized source table pagination limit exceeded.");
  }
  const [sets, tests, questions, passages] = await Promise.all([
    table("mock_test_sets"), table("mock_tests", { select: "*,mock_test_sets(name)" }),
    table("mock_test_questions"), table("mock_test_passages"),
  ]);
  const statsByPart = {};
  for (let part = 1; part <= 7; part++) {
    const rows = [];
    let complete = false;
    for (let page = 0; page < 100; page++) {
      const result = await client.request("/rest/v1/rpc/get_practice_stats_page", { method: "POST", body: { p_part: part, p_limit: 1000, p_offset: page * 1000 } });
      if (!Array.isArray(result.data) || result.data.length > 1000) throw new Error("Invalid authorized practice stats page.");
      rows.push(...result.data);
      if (result.httpDate) httpDate = result.httpDate;
      if (result.data.length < 1000) { complete = true; break; }
    }
    if (!complete) throw new Error("Authorized practice stats pagination limit exceeded.");
    statsByPart[part] = rows;
  }
  if (!httpDate || !Number.isFinite(Date.parse(httpDate))) throw new Error("Authorized source did not provide a valid synchronization date.");
  return { rows: { sets, tests, questions, passages, statsByPart }, httpDate };
}
