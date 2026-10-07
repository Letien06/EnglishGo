import { ApiError, NotFound } from "../api/response";
import { dictationCatalogSchema, dictationSetSchema, validateDictationSetMembership, type DictationCatalog, type DictationSet } from "../storage/dictation-snapshot";
import { isDriveContentEnabled, readDriveMaterial } from "./dautoeic-drive";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";

export function isDictationConfigured() { return isDriveContentEnabled(); }

const emptyCatalog = (): DictationCatalog => ({ version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", syncedAt: "1970-01-01T00:00:00.000Z", collections: [], chapters: [], sets: [] });

/** Optional materials keep older verified bundles usable without an upstream call. */
export async function getDictationCatalog(): Promise<DictationCatalog> {
  if (!isDictationConfigured()) return emptyCatalog();
  try {
    const catalog = dictationCatalogSchema.parse(await readDriveMaterial(`${DAUTOEIC_SOURCE_VERSION}__dictation__catalog`));
    catalog.sets.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));
    return catalog;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return emptyCatalog();
    throw error;
  }
}

export async function getDictationSet(setId: string): Promise<DictationSet> {
  const cleanId = setId.trim();
  const catalog = await getDictationCatalog();
  if (!catalog.sets.some((set) => set.id === cleanId)) throw NotFound("Không tìm thấy bài nghe chép chính tả.");
  const set = dictationSetSchema.parse(await readDriveMaterial(`${DAUTOEIC_SOURCE_VERSION}__dictation__set__${cleanId}`));
  if (set.setId !== cleanId) throw new Error("Dictation material identity mismatch.");
  validateDictationSetMembership(catalog, set);
  set.items.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));
  return set;
}
