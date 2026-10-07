import { describe, expect, it, vi } from "vitest";
import { authorizeDauEnglishImport, createImportAuthorization, exchangeImportCode, importCodeFromReturnedUrl, isImportCallback } from "../../scripts/lib/dauenglish-import-oauth.mjs";

describe("DauEnglish import OAuth", () => {
  it("uses Google sign-in with PKCE and a loopback callback", () => {
    const flow = createImportAuthorization({ state: "private-state", verifier: "private-verifier" });
    const url = new URL(flow.authorizationUrl);
    expect(url.origin).toBe("https://odlnhfaygiotcyehuysw.supabase.co");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("http://localhost:5173/?import_state=private-state");
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(flow.authorizationUrl).not.toContain("private-verifier");
    expect(() => createImportAuthorization({ sourceUrl: "https://untrusted.example" })).toThrow();
  });
  it("rejects callbacks with missing state, wrong state or an unrelated path", () => {
    expect(isImportCallback(new URL("http://localhost:5173/?import_state=expected&code=code"), "expected")).toBe(true);
    for (const path of ["/", "/?import_state=other", "/other?import_state=expected"]) {
      expect(isImportCallback(new URL(path, "http://localhost:5173"), "expected")).toBe(false);
    }
  });
  it("only accepts the official sign-in result for manual PKCE code exchange", () => {
    expect(importCodeFromReturnedUrl("https://dauenglish.com/?code=issued-code")).toBe("issued-code");
    for (const value of ["not-a-url", "https://untrusted.example/?code=code", "http://dauenglish.com/?code=code", "https://dauenglish.com/other?code=code", "https://dauenglish.com/?error=denied&code=code", "https://dauenglish.com/?access_token=never-accept"]) {
      expect(() => importCodeFromReturnedUrl(value)).toThrow();
    }
  });
  it("only returns an access session after verifying the requested account", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "access", refresh_token: "never-persist" })).mockResolvedValueOnce(Response.json({ email: "letiendk06@gmail.com" }));
    const token = await exchangeImportCode({ code: "code", verifier: "verifier", publicKey: "sb_publishable_test", expectedEmail: "letiendk06@gmail.com", fetcher });
    expect(token).toBe("access");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ auth_code: "code", code_verifier: "verifier" });
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer access");
  });
  it("fails closed for an expired exchange or a different signed-in account", async () => {
    const args = { code: "code", verifier: "verifier", publicKey: "sb_publishable_test", expectedEmail: "letiendk06@gmail.com" };
    const expired = vi.fn().mockResolvedValue(new Response("private upstream error", { status: 401 }));
    await expect(exchangeImportCode({ ...args, fetcher: expired })).rejects.toThrow("HTTP 401");
    expect(expired).toHaveBeenCalledTimes(1);
    const wrong = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "access" })).mockResolvedValueOnce(Response.json({ email: "another@example.com" }));
    await expect(exchangeImportCode({ ...args, fetcher: wrong })).rejects.toThrow("authorized DauEnglish account");
  });
  it("rejects unrelated loopback requests, flushes the valid response and closes after sign-in", async () => {
    const port = 59173;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "access" })).mockResolvedValueOnce(Response.json({ email: "letiendk06@gmail.com" }));
    let resolveUrl: (url: string) => void = () => {};
    const ready = new Promise<string>(resolve => { resolveUrl = resolve; });
    const authorization = authorizeDauEnglishImport({ publicKey: "sb_publishable_test", expectedEmail: "letiendk06@gmail.com", port, timeoutMs: 5_000, fetcher, onAuthorizationUrl: resolveUrl });
    const url = new URL(new URL(await ready).searchParams.get("redirect_to")!);
    const headers = { Host: `localhost:${port}` };
    const unrelated = await fetch(`http://127.0.0.1:${port}/?import_state=wrong&code=wrong`, { headers });
    expect(unrelated.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    url.searchParams.set("code", "granted-code");
    url.hostname = "127.0.0.1";
    const callback = await fetch(url, { headers });
    expect(callback.status).toBe(200);
    expect(callback.headers.get("cache-control")).toBe("no-store");
    expect(await callback.text()).toContain("Đã xác thực");
    expect(await authorization).toBe("access");
    await expect(fetch(url, { headers })).rejects.toThrow();
  });
});
