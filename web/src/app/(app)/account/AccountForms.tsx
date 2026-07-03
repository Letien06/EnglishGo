"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccountSettingsView } from "@/lib/services/account";

export default function AccountForms({ settings }: { settings: AccountSettingsView }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

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
              {settings.form.avatarUrl ? (
                <img src={settings.form.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                (settings.form.displayName || settings.email || "E").charAt(0).toUpperCase()
              )}
            </div>
            <span className="absolute -bottom-3 left-2 rounded-lg bg-emerald-900 px-3 py-2 text-sm font-extrabold text-white">
              Đổi ảnh
            </span>
          </div>
        </div>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void post("/api/account/profile", {
              displayName: form.get("displayName"),
              avatarUrl: form.get("avatarUrl") || null,
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

          <label className="block text-sm font-extrabold text-emerald-800">
            Avatar URL
            <input
              name="avatarUrl"
              defaultValue={settings.form.avatarUrl ?? ""}
              className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-4 py-3 text-base font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>

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
