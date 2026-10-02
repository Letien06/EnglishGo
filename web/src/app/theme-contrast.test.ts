import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve("src/app/globals.css"), "utf8");
const palettes = [
  ["dark", css.match(/:root\s*\{([^}]+)\}/)![1]],
  ["light", css.match(/\[data-theme="light"\]\s*\{([^}]+)\}/)![1]],
] as const;

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe.each(palettes)("%s learning palette", (_, declarations) => {
  const tokens = Object.fromEntries([...declarations.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/gi)].map((match) => [match[1], match[2]]));
  it.each(["s0", "s1", "s2", "paper"])("keeps primary, secondary and muted text readable on %s", (surface) => {
    for (const ink of ["ink", "ink2", "ink3", "mut"]) {
      expect(contrast(tokens[ink], tokens[surface]), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it.each(["info", "success", "warning", "danger", "teal"])("keeps %s text readable on tinted cards and nested surfaces", (tone) => {
    for (const surface of [`${tone}-soft`, "s1"]) {
      expect(contrast(tokens[`${tone}-ink`], tokens[surface])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens.ink, tokens[`${tone}-soft`])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("keeps small primary labels and primary buttons readable", () => {
    expect(contrast(tokens["primary-ink"], tokens.s1)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens["primary-ink"], tokens["primary-soft"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens["gold-ink"], tokens.gold)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens["gold-ink"], tokens.gold2)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps input boundaries distinguishable in both themes", () => {
    for (const surface of ["s1", "s2"]) expect(contrast(tokens["control-line"], tokens[surface])).toBeGreaterThanOrEqual(3);
  });
});
