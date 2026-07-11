"use client";

import Link from "next/link";
import { useState } from "react";

type ImportLesson = Record<string, unknown>;

export default function DictationBatchImportClient() {
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const runImport = async () => {
    setMessage("");
    let lessons: ImportLesson[];
    try {
      const parsed: unknown = JSON.parse(payload);
      lessons = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { lessons?: unknown })?.lessons) ? (parsed as { lessons: ImportLesson[] }).lessons : [];
      if (!lessons.length) throw new Error("JSON phải là mảng lesson hoặc có trường lessons.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "JSON không hợp lệ.");
      return;
    }

    setBusy(true);
    let created = 0;
    let skipped = 0;
    try {
      for (let offset = 0; offset < lessons.length; offset += 8) {
        setMessage(`Đang import ${Math.min(offset + 1, lessons.length)}–${Math.min(offset + 8, lessons.length)} / ${lessons.length} lesson...`);
        const response = await fetch("/api/admin/dictation/lessons/import-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessons: lessons.slice(offset, offset + 8) }),
        });
        const body = await response.json();
        if (!body.success) throw new Error(body.error ?? "Không thể import batch này.");
        created += body.data.created.length;
        skipped += body.data.skippedYoutubeVideoIds.length;
      }
      setMessage(`Hoàn tất: đã publish ${created} lesson, bỏ qua ${skipped} video đã tồn tại.`);
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : "Import bị dừng."} Các batch trước đó vẫn đã được lưu.`);
    } finally { setBusy(false); }
  };

  return <main className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-8">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-accent">ADMIN TOOL</p><h1 className="text-2xl font-extrabold text-ink">Import hàng loạt lesson Nghe-chép</h1><p className="mt-1 text-sm text-muted">Mỗi batch được xác thực quyền, tạo segment và publish riêng; lỗi một batch không xoá các batch đã hoàn tất.</p></div><Link href="/admin/dictation" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-bold text-ink no-underline">← Quản lý lesson</Link></div>
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm"><label className="block text-sm font-bold text-ink">JSON lesson đã chuẩn bị<textarea data-testid="dictation-batch-json" value={payload} onChange={(event) => setPayload(event.target.value)} placeholder='[{"title":"...", "segments":[...]}]' className="mt-2 min-h-[28rem] w-full rounded-xl border border-line p-3 font-mono text-xs font-normal" spellCheck={false} /></label><div className="mt-4 flex flex-wrap items-center gap-3"><button data-testid="dictation-batch-submit" type="button" disabled={busy || !payload.trim()} onClick={runImport} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">{busy ? "Đang import..." : "Xác thực và publish"}</button><p className="text-xs text-muted">Tối đa 8 lesson mỗi request; trang tự chia batch để tránh lỗi giới hạn Firestore.</p></div>{message && <p data-testid="dictation-batch-status" className="mt-4 rounded-xl bg-sky-50 p-4 text-sm font-semibold text-sky-800">{message}</p>}</section>
  </main>;
}
