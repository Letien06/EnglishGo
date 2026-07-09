import { describe, expect, it } from "vitest";
import { redact } from "./logging";

describe("redact", () => {
  it("redacts sensitive keys recursively", () => {
    expect(redact({
      event: "test",
      token: "secret-token",
      nested: {
        apiKey: "key",
        ok: "visible",
      },
      items: [{ cookie: "session" }],
    })).toEqual({
      event: "test",
      token: "[redacted]",
      nested: {
        apiKey: "[redacted]",
        ok: "visible",
      },
      items: [{ cookie: "[redacted]" }],
    });
  });
});
