import { createHash } from "node:crypto";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const decompress = promisify(gunzip);

/** Integrity applies to the decoded material, independently of gzip metadata. */
export async function decodeBundledMaterial(compressed: Uint8Array, expected: { bytes: number; sha256: string }): Promise<string> {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes <= 0) throw new Error("Invalid bundled material size.");
  const decoded = await decompress(compressed, { maxOutputLength: expected.bytes });
  if (decoded.byteLength !== expected.bytes || createHash("sha256").update(decoded).digest("hex") !== expected.sha256) {
    throw new Error("Content bundle material checksum mismatch.");
  }
  return decoded.toString("utf8");
}
