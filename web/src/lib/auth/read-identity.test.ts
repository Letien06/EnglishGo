import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verifySessionCookie: vi.fn(), verifyIdToken: vi.fn(), getUser: vi.fn(), cookie: vi.fn(), header: vi.fn(), collection: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback, revalidateTag: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }), headers: async () => ({ get: mocks.header }) }));
vi.mock("../firebase/admin", () => ({ adminAuth: mocks, adminDb: { collection: mocks.collection } }));
import { getReadIdentity } from "./session";

beforeEach(() => { vi.resetAllMocks(); });
describe("read-only identity", () => {
  it("verifies signature and revocation without reading a Firestore profile", async () => {
    mocks.cookie.mockReturnValue({ value: "signed-session" });
    mocks.verifySessionCookie.mockResolvedValue({ uid: "learner", auth_time: 100 });
    mocks.getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: new Date(0).toISOString() });
    expect(await getReadIdentity()).toEqual({ uid: "learner" });
    expect(mocks.verifySessionCookie).toHaveBeenCalledWith("signed-session", false);
    expect(mocks.getUser).toHaveBeenCalledWith("learner");
    expect(mocks.collection).not.toHaveBeenCalled();
  });
  it.each([{ disabled: true }, { disabled: false, tokensValidAfterTime: new Date(200_000).toISOString() }])("rejects disabled or revoked sessions", async (userRecord) => {
    mocks.cookie.mockReturnValue({ value: "signed-session" });
    mocks.verifySessionCookie.mockResolvedValue({ uid: "learner", auth_time: 100 });
    mocks.getUser.mockResolvedValue(userRecord);
    expect(await getReadIdentity()).toBeNull();
  });
  it("checks revocation for bearer tokens too", async () => {
    mocks.header.mockReturnValue("Bearer token");
    mocks.verifyIdToken.mockResolvedValue({ uid: "mobile" });
    expect(await getReadIdentity()).toEqual({ uid: "mobile" });
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("token", true);
  });
  it("fails closed for invalid tokens", async () => {
    mocks.cookie.mockReturnValue({ value: "invalid" });
    mocks.verifySessionCookie.mockRejectedValue(new Error("invalid"));
    expect(await getReadIdentity()).toBeNull();
    expect(mocks.collection).not.toHaveBeenCalled();
  });
});
