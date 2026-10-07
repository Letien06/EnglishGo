import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeBundledMaterial } from "./bundled-material";

const text = JSON.stringify({ title: "Đề thi 🎧" });
const expected = { bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") };

describe("compressed material integrity", () => {
  it("decodes UTF-8 and verifies decoded byte count and hash", async () => {
    await expect(decodeBundledMaterial(gzipSync(text), expected)).resolves.toBe(text);
  });
  it("rejects malformed gzip and valid gzip with the wrong decoded hash", async () => {
    await expect(decodeBundledMaterial(Buffer.from("corrupt"), expected)).rejects.toThrow();
    await expect(decodeBundledMaterial(gzipSync(text), { ...expected, sha256: "0".repeat(64) })).rejects.toThrow("checksum");
  });
  it("enforces the declared output bound while inflating", async () => {
    await expect(decodeBundledMaterial(gzipSync("x".repeat(1_000_000)), { ...expected, bytes: 100 })).rejects.toThrow();
    await expect(decodeBundledMaterial(gzipSync(text), { ...expected, bytes: expected.bytes + 1 })).rejects.toThrow("checksum");
  });
});
