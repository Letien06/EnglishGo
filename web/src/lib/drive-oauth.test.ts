import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeDrive } from "../../scripts/lib/drive-oauth.mjs";
import { connectDrive } from "../../scripts/lib/drive-connection.mjs";

const credentials = { clientId: "desktop-client", clientSecret: "client-secret", refreshToken: "refresh-secret" };
const clientConfig = { installed: { client_id: credentials.clientId, client_secret: credentials.clientSecret } };
const verifiedAccount = { user: { emailAddress: "owner@example.com" }, storageQuota: { limit: "5000000000000" } };
let testDirectory: string;
let clientFile: string;
let credentialFile: string;

beforeEach(async () => {
  vi.resetAllMocks();
  testDirectory = await mkdtemp(path.join(tmpdir(), "english-drive-oauth-test-"));
  clientFile = path.join(testDirectory, "client.json");
  credentialFile = path.join(testDirectory, "oauth.json");
  await writeFile(clientFile, JSON.stringify(clientConfig));
});

afterEach(async () => {
  for (const file of [clientFile, credentialFile]) {
    try { await unlink(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await rmdir(testDirectory);
});

describe("recoverable Drive connection", () => {
  it("preserves the grant on an API failure and resumes without another consent", async () => {
    const authorize = vi.fn().mockResolvedValue(credentials);
    const request = vi.fn().mockImplementation(async () => {
      expect(JSON.parse(await readFile(credentialFile, "utf8"))).toEqual(credentials);
      throw Object.assign(new Error("Google error body must not be printed"), { status: 403 });
    });
    const options = { clientFile, credentialFile, createClient: () => ({ request }), authorize };
    const firstAttempt = connectDrive(options);
    await expect(firstAttempt).rejects.toThrow("verification failed (403)");
    await expect(firstAttempt).rejects.not.toThrow("Google error body");
    expect(JSON.parse(await readFile(credentialFile, "utf8"))).toEqual(credentials);
    request.mockResolvedValue(new Response(JSON.stringify(verifiedAccount)));
    await expect(connectDrive(options)).resolves.toEqual({ accountEmail: "owner@example.com", storageQuota: verifiedAccount.storageQuota });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(credentialFile, "utf8"))).toEqual({ ...credentials, accountEmail: "owner@example.com" });
  });

  it("does not contact Drive if persisting a new grant fails", async () => {
    const createClient = vi.fn();
    await expect(connectDrive({ clientFile, credentialFile: path.join(testDirectory, "missing", "oauth.json"), createClient, authorize: vi.fn().mockResolvedValue(credentials) })).rejects.toThrow("ENOENT");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not mark a grant as connected without an account email", async () => {
    await expect(connectDrive({ clientFile, credentialFile, createClient: () => ({ request: vi.fn().mockResolvedValue(new Response("{}")) }), authorize: vi.fn().mockResolvedValue(credentials) })).rejects.toThrow("verification failed");
    expect(JSON.parse(await readFile(credentialFile, "utf8"))).toEqual(credentials);
  });

  it("does not reuse credentials belonging to another Desktop client", async () => {
    await writeFile(credentialFile, JSON.stringify({ ...credentials, clientId: "other-client" }));
    const authorize = vi.fn().mockResolvedValue(credentials);
    const createClient = vi.fn(() => ({ request: vi.fn().mockResolvedValue(new Response(JSON.stringify(verifiedAccount))) }));
    await connectDrive({ clientFile, credentialFile, createClient, authorize });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(credentials);
  });

  it("supports explicit reauthorization and protects a previously verified account", async () => {
    await writeFile(credentialFile, JSON.stringify({ ...credentials, accountEmail: "previous@example.com" }));
    const authorize = vi.fn().mockResolvedValue(credentials);
    const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify(verifiedAccount)));
    const options = { clientFile, credentialFile, createClient: () => ({ request }), authorize };
    await expect(connectDrive(options)).rejects.toThrow("previously verified storage owner");
    expect(authorize).not.toHaveBeenCalled();
    await expect(connectDrive({ ...options, reauthorize: true })).resolves.toHaveProperty("accountEmail", "owner@example.com");
    expect(authorize).toHaveBeenCalledTimes(1);
  });
});

describe("Drive loopback callback", () => {
  it("checks state and flushes a complete response before closing", async () => {
    let provideUrl: (url: URL) => void = () => {};
    const authorizationUrl = new Promise<URL>((resolve) => { provideUrl = resolve; });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ refresh_token: credentials.refreshToken })));
    const grant = authorizeDrive(clientFile, { fetcher, onAuthorizationUrl: (url: string) => provideUrl(new URL(url)), timeoutMs: 3000 });
    const url = await authorizationUrl;
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    expect(callback.hostname).toBe("127.0.0.1");
    callback.searchParams.set("state", "invalid-state");
    callback.searchParams.set("code", "test-authorization-code");
    const invalid = await fetch(callback);
    expect(invalid.status).toBe(400);
    await invalid.text();
    expect(fetcher).not.toHaveBeenCalled();
    callback.searchParams.set("state", url.searchParams.get("state")!);
    const response = await fetch(callback);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).toContain("Đã nhận quyền Google Drive");
    expect(text).not.toContain(credentials.refreshToken);
    await expect(grant).resolves.toEqual(credentials);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("delivers a readable failure without leaking Google's token error", async () => {
    let provideUrl: (url: URL) => void = () => {};
    const authorizationUrl = new Promise<URL>((resolve) => { provideUrl = resolve; });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error_description: "private-token-detail" }), { status: 403 }));
    const grant = authorizeDrive(clientFile, { fetcher, onAuthorizationUrl: (url: string) => provideUrl(new URL(url)), timeoutMs: 3000 });
    const rejected = grant.catch((error: Error) => error);
    const url = await authorizationUrl;
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", url.searchParams.get("state")!);
    callback.searchParams.set("code", "test-authorization-code");
    const response = await fetch(callback);
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("Không thể nhận quyền Drive");
    expect(text).not.toContain("private-token-detail");
    const error = await rejected;
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected the token exchange to fail.");
    expect(error.message).toContain("exchange failed (403)");
  });
});
