export default function GrammarLibraryLoading() {
  return <main className="mx-auto w-full max-w-5xl p-5 md:p-8" aria-busy="true">
    <p role="status" className="sr-only">Đang tải các chủ đề ngữ pháp.</p>
    <div className="h-5 w-28 rounded bg-surface-soft" aria-hidden="true" />
    <h1 className="mt-5 text-3xl font-extrabold text-ink">Ngữ pháp</h1>
    <p className="mt-2 text-muted">Luyện theo chủ đề, xem đáp án và giải thích sau mỗi câu.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="rounded-2xl border border-line bg-surface p-5">
        <div className="h-4 w-1/3 rounded bg-surface-soft" />
        <div className="mt-1 h-7 w-2/3 rounded bg-surface-soft" />
        <div className="mt-2 h-5 w-1/2 rounded bg-surface-soft" />
      </div>)}
    </div>
  </main>;
}
