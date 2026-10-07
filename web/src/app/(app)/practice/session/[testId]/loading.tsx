export default function PracticeSessionLoading() {
  return <main aria-busy="true" className="exam-workspace design-system min-h-[calc(100dvh-4rem)]">
    <p role="status" className="sr-only">Đang mở bài thi…</p>
    <header aria-hidden="true" className="exam-workspace-header sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 text-white shadow">
      <div className="h-9 w-20 animate-pulse rounded-lg bg-white/20" />
      <div className="h-6 min-w-0 flex-1 animate-pulse rounded bg-white/20" />
      <div className="h-9 w-28 animate-pulse rounded-lg bg-white/20" />
    </header>
    <div aria-hidden="true" className="grid grid-cols-1 gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-5 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="h-5 w-24 animate-pulse rounded bg-surface-soft" />
        <div className="h-24 animate-pulse rounded-lg bg-surface-soft" />
        {[1, 2, 3, 4].map((option) => <div key={option} className="h-14 animate-pulse rounded-lg bg-surface-soft" />)}
        <div className="flex justify-between"><div className="h-10 w-24 animate-pulse rounded-lg bg-surface-soft" /><div className="h-10 w-24 animate-pulse rounded-lg bg-surface-soft" /></div>
      </section>
      <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-soft" />
        <div className="grid grid-cols-5 gap-2">{Array.from({ length: 20 }, (_, index) => <div key={index} className="h-8 animate-pulse rounded-lg bg-surface-soft" />)}</div>
      </aside>
    </div>
  </main>;
}
