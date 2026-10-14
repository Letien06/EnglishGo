import { describe, expect, it } from "vitest";
import { normalizeDauToeicImageUrl } from "./dautoeic-media";

describe("DauEnglish image URLs", () => {
  it("rewrites legacy Part 1 Test 3 objects to the live optimized asset", () => {
    expect(normalizeDauToeicImageUrl("https://odlnhfaygiotcyehuysw.supabase.co/storage/v1/object/public/mock-test-media/dautoeic/p1/crackv1t3q4/1790571273990.jpg"))
      .toBe("https://odlnhfaygiotcyehuysw.supabase.co/storage/v1/object/public/mock-test-media/m/9b85c99167814ad2a47d1106303d8e96/1790571273990.jpg.w960.webp");
  });

  it("leaves non-legacy media untouched", () => {
    const url = "https://example.com/question.jpg";
    expect(normalizeDauToeicImageUrl(url)).toBe(url);
    expect(normalizeDauToeicImageUrl(null)).toBeNull();
  });
});
