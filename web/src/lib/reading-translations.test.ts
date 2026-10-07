import { describe, expect, it } from "vitest";
import { parseReadingOptionTranslations } from "./reading-translations";

const options = [
  { key: "A", text: "satisfy" }, { key: "B", text: "satisfied" },
  { key: "C", text: "satisfying" }, { key: "D", text: "satisfaction" },
];

describe("reading option translations", () => {
  it("matches the reported unlabelled satisfy glossary", () => {
    expect(parseReadingOptionTranslations("satisfy (v): làm hài lòng\n\nsatisfied (adj): hài lòng\n\nsatisfying (adj): làm hài lòng\n\nsatisfaction (n): sự hài lòng", options)).toEqual({ A: "làm hài lòng", B: "hài lòng", C: "làm hài lòng", D: "sự hài lòng" });
  });
  it("matches reordered glossary entries by word and leaves missing options absent", () => {
    expect(parseReadingOptionTranslations("satisfaction (n): sự hài lòng\n SATISFIED (adj): hài lòng", options)).toEqual({ D: "sự hài lòng", B: "hài lòng" });
  });
  it("supports punctuated option labels in lines and inline records", () => {
    expect(parseReadingOptionTranslations("A. một B) hai\n(C) ba\nD: bốn", options)).toEqual({ A: "một", B: "hai", C: "ba", D: "bốn" });
  });
  it("rejects ordinary prose beginning with option letters", () => {
    expect(parseReadingOptionTranslations("A service is available.\nB employees arrived.\nC company offers support.\nD customers waited.", options)).toEqual({});
  });
  it("does not infer translations from an unrelated glossary or word fragments", () => {
    expect(parseReadingOptionTranslations("unsatisfied (adj): không hài lòng\nservice: dịch vụ", options)).toEqual({});
  });
  it("maps duplicate option words to the same glossary meaning", () => {
    expect(parseReadingOptionTranslations(" service (n): dịch vụ", [{ key: "A", text: "Service" }, { key: "B", text: " service " }])).toEqual({ A: "dịch vụ", B: "dịch vụ" });
  });
});
