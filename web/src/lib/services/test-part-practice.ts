import { ApiError } from "../api/response";
import { getPart, listTests, practiceSessionFromPart } from "./dautoeic";
import type { DauToeicPartTest } from "@/types/dautoeic";
import { readServerCache } from "../server-cache";
import { contentCacheKey, readDriveCatalogIndex } from "./dautoeic-drive";

export interface TestPartCatalogEntry {
  test: DauToeicPartTest;
  items: Array<{ id: string; questionIds: string[] }>;
}

export function validateTestPart(testId: string, part: number) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(testId) || !Number.isInteger(part) || part < 1 || part > 7) {
    throw new ApiError("Test hoặc Part không hợp lệ.", 400);
  }
}

export async function getTestPartSession(testId: string, part: number) {
  validateTestPart(testId, part);
  const content = await getPart(testId, part);
  if (content.test.id !== testId || content.part !== part || content.test.isHidden) throw new ApiError("Không tìm thấy phần này trong test.", 404);
  return practiceSessionFromPart(content);
}

export async function listTestParts(part: number): Promise<TestPartCatalogEntry[]> {
  validateTestPart("catalog", part);
  return readServerCache(() => buildTestPartCatalog(part), ["test-part-catalog-v2", contentCacheKey(), String(part)], { revalidate: 3600, tags: [] });
}

async function buildTestPartCatalog(part: number): Promise<TestPartCatalogEntry[]> {
  const tests = (await listTests()).filter((test) => !test.isHidden).sort((left, right) =>
    (left.setName ?? "").localeCompare(right.setName ?? "", "vi", { numeric: true }) ||
    (left.orderIndex ?? 0) - (right.orderIndex ?? 0) ||
    (left.name ?? "").localeCompare(right.name ?? "", "vi", { numeric: true }) || left.id.localeCompare(right.id),
  );
  const compactIndex = await readDriveCatalogIndex(part);
  if (compactIndex) {
    const indexed = tests.map((test) => compactIndex[test.id]).filter(Boolean);
    if (indexed.length === tests.length) {
      return indexed.map((entry) => ({
        test: {
          ...entry.test,
          part,
        },
        items: entry.items,
      }));
    }
  }
  const entries: TestPartCatalogEntry[] = [];
  for (let offset = 0; offset < tests.length; offset += 6) {
    entries.push(...await Promise.all(tests.slice(offset, offset + 6).map(async (test) => {
      const session = await getTestPartSession(test.id, part);
      return {
        test: {
          testId: test.id, testName: session.testName!, setName: session.setName!, part,
          questionCount: session.items.reduce((sum, item) => sum + item.questions.length, 0),
          itemCount: session.items.length, done: 0, correct: 0, wrong: 0, nextIndex: 0,
        },
        items: session.items.map((item) => ({ id: item.id, questionIds: item.questions.map((question) => question.id) })),
      };
    })));
  }
  return entries;
}
