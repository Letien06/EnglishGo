import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const layout = readFileSync("src/app/layout.tsx", "utf8");
const initScript = layout.match(/const themeInitScript = `([\s\S]*?)`;/)![1];

describe("pre-hydration theme initialization", () => {
  it.each([
    [null, null, "dark"],
    ["light", null, "dark"],
    ["light", "1", "light"],
    ["dark", "1", "dark"],
    ["invalid", "1", "dark"],
  ])("handles saved=%s manual=%s", (saved, manual, expected) => {
    const document = { documentElement: { dataset: { theme: "dark" } } };
    runInNewContext(initScript, { document, localStorage: { getItem: (key: string) => key === "englishgo-theme" ? saved : manual } });
    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(layout).toContain('data-theme="dark"');
  });
  it("defaults to dark if storage throws", () => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(initScript, { document, localStorage: { getItem: () => { throw new Error("Denied"); } } });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
