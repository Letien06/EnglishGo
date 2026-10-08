import ReadingSectionNav from "@/components/ReadingSectionNav";

export default function GrammarLibraryLoading() {
  return <main className="mx-auto w-full max-w-7xl p-5 md:p-8" aria-busy="true">
    <p role="status" className="sr-only">Đang tải các chủ đề ngữ pháp.</p>
    <ReadingSectionNav selected="grammar" />
    <header className="mt-7"><p className="text-xs font-extrabold uppercase tracking-wider text-teal-ink">Luyện đọc</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Ngữ pháp</h1><p className="mt-2 text-sm text-muted">Chọn chủ đề để luyện tập, xem giải thích và bản dịch sau mỗi câu.</p></header>
    <div className="mt-6 flex flex-wrap gap-2" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-10 w-24 rounded-full border border-line bg-surface-soft" />)}</div>
    <div aria-hidden="true">
      {Array.from({ length: 3 }, (_, group) => <section key={group} className="mt-8">
        <div className="mb-4 h-7 w-48 rounded bg-surface-soft" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex gap-3"><div className="h-10 w-10 shrink-0 rounded-xl bg-teal-soft" /><div className="flex-1"><div className="h-6 w-2/3 rounded bg-surface-soft" /><div className="mt-2 h-5 w-full rounded bg-surface-soft" /></div></div>
            <div className="mt-5 h-4 w-3/4 rounded bg-surface-soft" />
            <div className="mt-5 h-11 rounded-xl bg-teal-soft" />
          </div>)}
        </div>
      </section>)}
    </div>
  </main>;
}
