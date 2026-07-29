import { describe, expect, it } from "vitest";
import { englishExampleForSpeech } from "./vocab-speech";

describe("englishExampleForSpeech", () => {
  it("removes a Vietnamese translation in trailing parentheses", () => {
    expect(
      englishExampleForSpeech(
        "Customers frequently inquire about warranty coverage and claim procedures. (Khách hàng thường xuyên hỏi về phạm vi bảo hành và quy trình yêu cầu.)",
      ),
    ).toBe("Customers frequently inquire about warranty coverage and claim procedures.");
  });

  it("keeps only the first line when the translation is on a new line", () => {
    expect(
      englishExampleForSpeech("The report is on the desk.\nBáo cáo ở trên bàn."),
    ).toBe("The report is on the desk.");
  });

  it("keeps English parentheses that are part of the example", () => {
    expect(
      englishExampleForSpeech("Please complete the annual leave (AL) form."),
    ).toBe("Please complete the annual leave (AL) form.");
  });
});
