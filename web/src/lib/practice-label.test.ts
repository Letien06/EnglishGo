import { describe, expect, it } from "vitest";
import { formatPracticeLabel } from "./practice-label";

describe("practice display labels", () => {
  it("removes the source brand while retaining the test and volume", () => {
    expect(formatPracticeLabel("Crack TOEIC Vol1")).toBe("TOEIC Vol1");
    expect(formatPracticeLabel("  CRACK   TOEIC  Vol2 ")).toBe("TOEIC Vol2");
    expect(formatPracticeLabel("Crack")).toBe("TOEIC");
  });
  it("preserves words that contain the same letters", () => {
    expect(formatPracticeLabel("A cracked window")).toBe("A cracked window");
    expect(formatPracticeLabel("Crackling sound")).toBe("Crackling sound");
    expect(formatPracticeLabel("ETS TOEIC Test 1")).toBe("ETS TOEIC Test 1");
  });
});
