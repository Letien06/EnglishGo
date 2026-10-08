export default function AudioDictationPlayerLoading() {
  return <main className="mx-auto max-w-3xl px-4 py-8" aria-busy="true">
    <p role="status" className="sr-only">Đang tải âm thanh và bài nghe chép TOEIC.</p>
    <div aria-hidden="true">
      <div className="h-5 w-40 rounded bg-surface-soft" />
      <div className="mt-5 h-8 w-1/2 rounded bg-surface-soft" />
      <div className="mt-2 h-5 w-2/3 rounded bg-surface-soft" />
      <div className="mt-2 h-4 w-3/4 rounded bg-surface-soft" />
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="h-14 w-full rounded-full bg-surface-soft" />
        <div className="mt-5 h-10 w-56 max-w-full rounded-lg bg-surface-soft" />
        <div className="mt-5 h-5 w-36 rounded bg-surface-soft" />
        <div className="mt-2 h-32 w-full rounded-xl border border-line bg-surface-soft" />
        <div className="mt-4 h-10 w-28 rounded-xl bg-surface-soft" />
      </section>
      <div className="mt-5 flex justify-between gap-3"><div className="h-10 w-32 rounded-xl bg-surface-soft" /><div className="h-10 w-32 rounded-xl bg-surface-soft" /></div>
    </div>
  </main>;
}
