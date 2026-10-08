export default function AudioDictationLibraryLoading() {
  return <main className="mx-auto max-w-6xl px-4 py-8" aria-busy="true">
    <p role="status" className="sr-only">Đang tải thư viện nghe chép TOEIC.</p>
    <div className="h-5 w-28 rounded bg-surface-soft" aria-hidden="true" />
    <h1 className="mt-5 text-3xl font-extrabold text-ink">Nghe chép TOEIC</h1>
    <p className="mt-3 text-muted">Nghe từng câu, điền từ hoặc chép lại toàn bộ. Tiến độ được lưu trên thiết bị này theo tài khoản.</p>
    <section className="mt-8" aria-hidden="true">
      <div className="mb-4 h-7 w-36 rounded bg-surface-soft" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="h-4 w-2/3 rounded bg-surface-soft" />
          <div className="mt-2 h-6 w-1/2 rounded bg-surface-soft" />
          <div className="mt-4 h-5 w-3/4 rounded bg-surface-soft" />
        </div>)}
      </div>
    </section>
  </main>;
}
