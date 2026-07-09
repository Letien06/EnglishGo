"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccountSettingsView } from "@/lib/services/account";

const MAX_AVATAR_DATA_URL_LENGTH = 240_000;
const AVATAR_SIZE = 160;

export default function AccountForms({ settings }: { settings: AccountSettingsView }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(settings.form.avatarUrl ?? "");

  async function post(url: string, payload: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setMessage(result.error || "Lưu thay đổi thất bại.");
      return;
    }
    setMessage("Đã lưu thay đổi.");
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <section id="profile" className="space-y-6">
        <div className="flex items-end gap-6">
          <div className="relative">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-amber-200 bg-sky-100 text-4xl font-extrabold text-primary">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  width={AVATAR_SIZE}
                  height={AVATAR_SIZE}
                  sizes="112px"
                  unoptimized={avatarUrl.startsWith("data:")}
                  className="h-full w-full object-cover"
                />
              ) : (
                (settings.form.displayName || settings.email || "E").charAt(0).toUpperCase()
              )}
            </div>
            <label className="absolute -bottom-3 left-2 cursor-pointer rounded-lg bg-emerald-900 px-3 py-2 text-sm font-extrabold text-white transition-opacity hover:opacity-90">
              Đổi ảnh
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  try {
                    const nextAvatar = await imageFileToAvatarDataUrl(file);
                    setAvatarUrl(nextAvatar);
                    setMessage("Đã chọn ảnh. Bấm lưu thay đổi để cập nhật.");
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Không thể xử lý ảnh.");
                  }
                }}
              />
            </label>
          </div>
        </div>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void post("/api/account/profile", {
              displayName: form.get("displayName"),
              avatarUrl: avatarUrl || null,
            });
          }}
        >
          <label className="block text-sm font-extrabold text-emerald-800">
            Tên hiển thị
            <input
              name="displayName"
              defaultValue={settings.form.displayName}
              required
              className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-4 py-3 text-base font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label className="block text-sm font-extrabold text-emerald-800">
            Email
            <input
              value={settings.email}
              readOnly
              className="mt-2 w-full rounded-lg border border-emerald-200 bg-slate-50 px-4 py-3 text-base font-bold text-ink"
            />
          </label>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm text-emerald-900">
            <p className="font-extrabold">Ảnh đại diện</p>
            <p className="mt-1 text-xs font-bold text-muted">
              Ảnh được nén nhỏ trên trình duyệt rồi lưu dạng base64 trong Firestore,
              không cần Firebase Storage. Nên dùng ảnh chân dung rõ mặt.
            </p>
            {avatarUrl ? (
              <button
                type="button"
                onClick={() => {
                  setAvatarUrl("");
                  setMessage("Đã bỏ ảnh đại diện. Bấm lưu thay đổi để cập nhật.");
                }}
                className="mt-3 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-xs font-extrabold text-emerald-900"
              >
                Xóa ảnh hiện tại
              </button>
            ) : null}
          </div>

          <button className="w-full rounded-lg bg-primary py-3 text-base font-extrabold text-gold-ink transition-opacity hover:opacity-90">
            Lưu thay đổi
          </button>
        </form>
      </section>

      <section id="password" className="border-t border-line pt-8">
        <h2 className="text-xl font-extrabold text-ink">Đổi mật khẩu</h2>
        <form
          className="mt-4 flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void post("/api/account/password", { newPassword: form.get("newPassword") });
            event.currentTarget.reset();
          }}
        >
          <input
            name="newPassword"
            type="password"
            minLength={6}
            required
            placeholder="Mật khẩu mới"
            className="flex-1 rounded-lg border border-line bg-white px-4 py-3 text-sm text-ink"
          />
          <button className="rounded-lg bg-surface-soft px-5 py-3 text-sm font-extrabold text-ink">
            Cập nhật
          </button>
        </form>
      </section>

      <section id="devices" className="border-t border-line pt-8">
        <h2 className="text-xl font-extrabold text-ink">Thiết bị</h2>
        <p className="mt-2 text-sm text-muted">Phiên trình duyệt hiện tại đang hoạt động.</p>
      </section>

      {message && <p className="text-sm font-bold text-primary">{message}</p>}
    </div>
  );
}

async function imageFileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Vui lòng chọn đúng file ảnh.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.");
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");

  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.max(0, Math.floor((bitmap.width - sourceSize) / 2));
  const sourceY = Math.max(0, Math.floor((bitmap.height - sourceSize) / 2));
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
  if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("Ảnh sau khi nén vẫn quá lớn. Vui lòng chọn ảnh khác.");
  }
  return dataUrl;
}
