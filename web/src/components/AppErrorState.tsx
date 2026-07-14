"use client";

import Link from "next/link";

export default function AppErrorState({
  title = "Có sự cố nhỏ khi mở nội dung",
  description = "Dữ liệu học tập của bạn vẫn an toàn. Hãy thử lại hoặc quay về trang chủ để tiếp tục.",
  onRetry,
  homeHref = "/hub",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  homeHref?: string;
}) {
  return (
    <main className="app-canvas flex min-h-[70dvh] items-center justify-center px-5 py-12">
      <section className="app-error-card w-full max-w-xl p-6 text-center sm:p-8" role="alert">
        <span className="app-error-mark" aria-hidden="true">!</span>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">ENGLISHGO</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">{description}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="premium-primary inline-flex min-h-11 items-center justify-center px-5 text-sm">
              Thử lại
            </button>
          ) : null}
          <Link href={homeHref} className="premium-secondary inline-flex min-h-11 items-center justify-center px-5 text-sm">
            Về trang học
          </Link>
        </div>
      </section>
    </main>
  );
}
