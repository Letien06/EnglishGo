export default function DictationLessonLoading() {
  return <main className="min-h-[calc(100dvh-4rem)] bg-bg px-3 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="Đang tải bài nghe chép"><div className="mx-auto max-w-7xl">
    <div className="mb-4 flex h-10 items-center gap-3" aria-hidden="true"><div className="h-9 w-28 rounded-xl bg-surface" /><div className="h-5 w-44 rounded bg-surface" /></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" role="status" aria-label="Đang tải video và đoạn nghe">
      <section className="space-y-5" aria-hidden="true"><div className="aspect-video rounded-2xl bg-line" /><div className="h-56 rounded-2xl bg-surface" /></section>
      <aside className="space-y-4 rounded-2xl bg-surface p-5" aria-hidden="true"><div className="h-6 rounded bg-surface-soft" />{Array.from({ length: 6 }, (_, index) => <div className="h-16 rounded-xl bg-surface-soft" key={index} />)}</aside>
    </div>
  </div></main>;
}
