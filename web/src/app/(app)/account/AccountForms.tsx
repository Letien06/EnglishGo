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
  const [targetScore, setTargetScore] = useState<number>(settings.form.targetScore ?? 650);

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
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-primary/25 bg-info-soft text-4xl font-extrabold text-info-ink">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Ảnh đại diện"
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
            <label className="absolute -bottom-3 left-2 cursor-pointer rounded-lg bg-primary px-3 py-2 text-sm font-extrabold text-gold-ink transition-opacity hover:opacity-90">
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
          <label className="block text-sm font-extrabold text-ink">
            Tên hiển thị
            <input
              name="displayName"
              defaultValue={settings.form.displayName}
              required
              className="mt-2 w-full rounded-lg border border-control-line bg-surface px-4 py-3 text-base font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

          <label className="block text-sm font-extrabold text-ink">
            Email
            <input
              value={settings.email}
              readOnly
              className="mt-2 w-full rounded-lg border border-control-line bg-surface-soft px-4 py-3 text-base font-bold text-ink"
            />
          </label>

          <div className="rounded-xl border border-info-line bg-info-soft p-4 text-sm text-info-ink">
            <p className="font-extrabold">Ảnh đại diện</p>
            <p className="mt-1 text-xs font-bold text-muted">
              Chọn ảnh PNG, JPEG hoặc WebP dưới 5 MB, có khuôn mặt rõ nét.
              Bấm lưu thay đổi để cập nhật ảnh đại diện.
            </p>
            {avatarUrl ? (
              <button
                type="button"
                onClick={() => {
                  setAvatarUrl("");
                  setMessage("Đã bỏ ảnh đại diện. Bấm lưu thay đổi để cập nhật.");
                }}
                className="mt-3 rounded-lg border border-control-line bg-surface px-4 py-2 text-xs font-extrabold text-ink"
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

      <section id="goals" className="border-t border-line pt-8 space-y-4">
        <div>
          <h2 className="text-xl font-extrabold text-ink">Mục tiêu điểm TOEIC</h2>
          <p className="mt-1 text-sm text-muted">Đồng bộ trực tiếp với lộ trình và tiến độ trên bảng điều khiển trung tâm (/hub).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[450, 550, 650, 750, 850, 900, 990].map((scoreValue) => (
            <button
              key={scoreValue}
              type="button"
              onClick={() => setTargetScore(scoreValue)}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${
                targetScore === scoreValue
                  ? "bg-primary text-gold-ink"
                  : "border border-control-line bg-surface-soft text-ink hover:border-primary"
              }`}
            >
              {scoreValue} điểm
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={10}
            max={990}
            step={5}
            aria-label="Điểm TOEIC mục tiêu"
            value={targetScore}
            onChange={(event) => setTargetScore(Number(event.target.value))}
            className="w-36 rounded-lg border border-control-line bg-surface px-4 py-2.5 text-base font-bold text-ink"
          />
          <button
            type="button"
            onClick={() => {
              const clamped = Math.min(990, Math.max(10, Math.round(targetScore / 5) * 5));
              setTargetScore(clamped);
              void post("/api/dashboard/preferences", { targetScore: clamped });
            }}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-extrabold text-gold-ink transition-opacity hover:opacity-90"
          >
            Lưu mục tiêu điểm
          </button>
        </div>
      </section>

      <section id="password" className="border-t border-line pt-8">
        <h2 className="text-xl font-extrabold text-ink">Đổi mật khẩu</h2>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
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
            aria-label="Mật khẩu mới"
            className="min-w-0 flex-1 rounded-lg border border-control-line bg-surface px-4 py-3 text-sm text-ink"
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
