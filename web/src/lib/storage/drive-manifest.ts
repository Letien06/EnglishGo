import { z } from "zod";
import { DAUTOEIC_SOURCE_VERSION } from "../services/dautoeic-source";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const chunk = z.object({ fileId: z.string().regex(/^[a-zA-Z0-9_-]{10,200}$/), sha256: hash, bytes: z.number().int().positive().max(700_000) });
const entry = z.object({
  kind: z.enum(["sets", "tests", "test", "test-part", "difficulty-levels", "difficulty-session", "vocabulary", "dictation-catalog", "dictation-set", "grammar-catalog", "grammar-topic"]),
  sha256: hash,
  bytes: z.number().int().positive().max(32_000_000),
  chunks: z.array(chunk).min(1).max(64),
}).refine((value) => value.chunks.reduce((total, item) => total + item.bytes, 0) === value.bytes, "Drive chunk byte counts do not match.");

export const driveManifestSchema = z.object({
  formatVersion: z.literal(1),
  source: z.literal("https://dauenglish.com"),
  sourceVersion: z.literal(DAUTOEIC_SOURCE_VERSION),
  snapshotSha256: hash,
  syncedAt: z.string().datetime(),
  entries: z.record(z.string().regex(/^dauenglish-v2__[a-zA-Z0-9_-]+$/), entry),
}).refine((manifest) => Object.keys(manifest.entries).length > 0 && Object.keys(manifest.entries).length <= 5000, "Invalid Drive material count.");

export type DriveManifest = z.infer<typeof driveManifestSchema>;
