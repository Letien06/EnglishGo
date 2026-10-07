export default function WritingPracticeLoading() {
  return <main className="app-canvas min-h-dvh px-3 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="Đang tải bài luyện viết"><div className="mx-auto max-w-7xl">
    <div className="mb-4 flex h-10 items-center gap-3" aria-hidden="true"><div className="h-9 w-28 rounded-xl bg-surface-soft" /><div className="h-5 w-44 rounded bg-surface-soft" /></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]" role="status" aria-label="Đang tải đề và khung bài viết">
      <section className="premium-card space-y-5 p-5 sm:p-6" aria-hidden="true"><div className="h-7 w-2/3 rounded bg-surface-soft" /><div className="aspect-video rounded-xl bg-surface-soft" /><div className="h-20 rounded-xl bg-surface-soft" /></section>
      <section className="premium-card space-y-5 p-5 sm:p-6" aria-hidden="true"><div className="h-7 w-1/3 rounded bg-surface-soft" /><div className="h-80 rounded-xl bg-surface-soft" /><div className="h-11 rounded-xl bg-surface-soft" /></section>
    </div>
  </div></main>;
}
