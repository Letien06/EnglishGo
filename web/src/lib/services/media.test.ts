import { describe, expect, it } from "vitest";
import { storeMedia } from "./media";
import type { AppUser } from "@/types";

const adminUser: AppUser = {
  uid: "admin-user",
  firebaseUid: "admin-user",
  email: "admin@example.com",
  displayName: "Admin",
  avatarUrl: null,
  role: "ADMIN",
  level: null,
  targetScore: null,
  createdAtMillis: null,
  updatedAtMillis: null,
};

describe("storeMedia", () => {
  it("rejects wrong audio content type before touching storage", async () => {
    const file = new File(["not audio"], "note.txt", { type: "text/plain" });

    await expect(storeMedia(file, "AUDIO", adminUser)).rejects.toMatchObject({
      message: "Chi ho tro audio mp3.",
      status: 400,
    });
  });
});
