"use client";

import Link from "next/link";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-canvas flex min-h-[calc(100dvh-4rem)] items-center justify-center px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-line bg-surface p-7 text-center shadow-xl sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Không gian học tập</p>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">Không thể tải nội dung này</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Hãy thử lại. Nếu lỗi vẫn còn, quay về trang học để tiếp tục phần khác — tiến độ đã lưu không bị xoá.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="premium-primary px-5 py-2.5 text-sm">Thử lại</button>
          <Link href="/hub" className="rounded-xl border border-line px-5 py-2.5 text-sm font-extrabold text-ink">Về trang học</Link>
        </div>
      </section>
    </main>
  );
}
