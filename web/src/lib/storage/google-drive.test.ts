import { describe, expect, it, vi } from "vitest";
import { createDriveClient } from "./google-drive";

const credentials = { clientId: "client", clientSecret: "secret", refreshToken: "refresh-secret" };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe("private Google Drive client", () => {
  it("coalesces token refreshes and never puts credentials in URLs", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("oauth2.googleapis.com") ? response({ access_token: "access", expires_in: 3600 }) : response({ ok: true }));
    const client = createDriveClient(credentials, fetcher);
    await Promise.all([client.request("/drive/v3/files/file_1234567"), client.request("/drive/v3/files/file_1234568")]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("oauth2.googleapis.com"))).toHaveLength(1);
    const calls = fetcher.mock.calls.filter(([url]) => String(url).includes("www.googleapis.com"));
    expect(calls).toHaveLength(2);
    for (const [url, init] of calls) {
      expect(String(url)).not.toContain("secret");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access");
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("error");
    }
  });

  it("refreshes once on 401 but does not retry quota failures", async () => {
    let reads = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("oauth2.googleapis.com")) return response({ access_token: "access", expires_in: 3600 });
      reads++;
      return response({}, reads === 1 ? 401 : 429);
    });
    await expect(createDriveClient(credentials, fetcher).request("/drive/v3/files/file_1234567")).rejects.toThrow("429");
    expect(reads).toBe(2);
  });

  it("refuses to send credentials outside Google's Drive endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createDriveClient(credentials, fetcher);
    for (const path of ["https://attacker.example/drive/v3/files/test", "//attacker.example/drive/v3/files/test", "https://www.googleapis.com/oauth2/test"]) {
      await expect(client.request(path)).rejects.toThrow("only be sent");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enforces streamed byte limits and UTF-8 correctness", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("oauth2.googleapis.com") ? response({ access_token: "access", expires_in: 3600 }) : new Response("Tiếng Việt 🎧"));
    const client = createDriveClient(credentials, fetcher);
    await expect(client.readText("file_1234567", 100)).resolves.toBe("Tiếng Việt 🎧");
    await expect(client.readText("file_1234567", 3)).rejects.toThrow("size limit");
    await expect(client.readText("invalid/path", 100)).rejects.toThrow("file ID");
  });

  it("does not echo OAuth secrets or Google's error body", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ error_description: "refresh-secret" }, 400));
    const promise = createDriveClient(credentials, fetcher).request("/drive/v3/files/file_1234567");
    await expect(promise).rejects.toThrow("token refresh failed (400)");
    await expect(promise).rejects.not.toThrow("refresh-secret");
  });
});
