import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const name = z.string().trim().min(1);
const nullableText = z.string().nullable();
const orderIndex = z.number().int().nullable();
const provenance = {
  version: z.literal(1),
  source: z.literal("https://dauenglish.com"),
  accessScope: z.literal("provider-authorized"),
};

export const dictationCatalogSchema = z.strictObject({
  ...provenance,
  syncedAt: z.string().datetime(),
  collections: z.array(z.strictObject({ name, orderIndex })),
  chapters: z.array(z.strictObject({ collectionName: name, name, orderIndex })),
  sets: z.array(z.strictObject({
    id, name, part: z.number().int().min(1).max(7).nullable(),
    accessLevel: z.enum(["free", "pro"]), orderIndex,
    collectionName: name.nullable(), chapterName: name.nullable(),
    subtitle: nullableText, itemCount: z.number().int().positive(),
  })),
}).superRefine((catalog, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const collections = new Set(catalog.collections.map((entry) => entry.name));
  const chapterKey = (collection: string, chapter: string) => JSON.stringify([collection, chapter]);
  const chapters = new Set(catalog.chapters.map((entry) => chapterKey(entry.collectionName, entry.name)));
  if (collections.size !== catalog.collections.length || chapters.size !== catalog.chapters.length || new Set(catalog.sets.map((set) => set.id)).size !== catalog.sets.length) fail("Duplicate dictation catalog identity.");
  for (const chapter of catalog.chapters) if (!collections.has(chapter.collectionName)) fail("Unknown dictation collection.");
  for (const set of catalog.sets) {
    if (set.collectionName && !collections.has(set.collectionName)) fail("Unknown dictation collection.");
    if (set.chapterName && (!set.collectionName || !chapters.has(chapterKey(set.collectionName, set.chapterName)))) fail("Unknown dictation chapter.");
  }
});

export const dictationSetSchema = z.strictObject({
  ...provenance,
  setId: id,
  items: z.array(z.strictObject({
    id, setId: id, orderIndex,
    audioUrl: z.url().refine((url) => /^https?:\/\//.test(url), "Dictation audio must be an absolute HTTP URL."),
    transcript: z.string().trim(), transcriptMissing: z.literal(true).optional(),
    translationVi: nullableText, hint: nullableText, vocabulary: nullableText,
    durationSeconds: z.number().finite().nonnegative().nullable(), groupId: id.nullable(),
  })).min(1),
}).superRefine((set, context) => {
  if (new Set(set.items.map((item) => item.id)).size !== set.items.length || set.items.some((item) => item.setId !== set.setId)) {
    context.addIssue({ code: "custom", message: "Duplicate or mismatched dictation item identity." });
  }
  if (set.items.some((item) => (item.transcriptMissing === true) !== (item.transcript.length === 0))) {
    context.addIssue({ code: "custom", message: "Missing dictation transcript must have an explicit source marker." });
  }
});

export type DictationCatalog = z.infer<typeof dictationCatalogSchema>;
export type DictationSet = z.infer<typeof dictationSetSchema>;

export function validateDictationSetMembership(catalog: DictationCatalog, set: DictationSet) {
  const entry = catalog.sets.find((entry) => entry.id === set.setId);
  if (!entry || entry.itemCount !== set.items.length) throw new Error("Dictation set membership or item count mismatch.");
}
