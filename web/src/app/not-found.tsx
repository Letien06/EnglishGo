import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-canvas flex min-h-dvh items-center justify-center px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-line bg-surface p-7 text-center shadow-xl sm:p-10">
        <p className="text-5xl" aria-hidden="true">404</p>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Không tìm thấy trang này</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Đường dẫn có thể đã thay đổi hoặc nội dung không còn khả dụng.</p>
        <Link href="/" className="premium-primary mt-6 inline-flex px-5 py-2.5 text-sm">Về trang chủ</Link>
      </section>
    </main>
  );
}
