export default function GrammarPlayerLoading() {
  return <main className="mx-auto w-full max-w-4xl p-5 md:p-8" aria-busy="true">
    <p role="status" className="sr-only">Đang tải câu hỏi và bài luyện ngữ pháp.</p>
    <div aria-hidden="true">
      <div className="h-5 w-28 rounded bg-surface-soft" />
      <div className="mt-4 h-8 w-1/2 rounded bg-surface-soft" />
      <div className="mt-3 h-5 w-3/4 rounded bg-surface-soft" />
      <div className="mt-2 h-5 w-48 rounded bg-surface-soft" />
      <div className="my-6 flex flex-wrap gap-3"><div className="h-10 w-64 max-w-full rounded-xl bg-surface-soft" /><div className="h-10 w-28 rounded-xl bg-surface-soft" /></div>
      <article className="rounded-2xl border border-line bg-surface p-5 md:p-7">
        <div className="h-5 w-24 rounded bg-surface-soft" />
        <div className="mt-4 h-14 w-full rounded bg-surface-soft" />
        <div className="mt-5 space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 rounded-xl border border-line bg-surface-soft" />)}</div>
      </article>
      <div className="mt-5 flex justify-between gap-3"><div className="h-12 w-32 rounded-xl bg-surface-soft" /><div className="h-12 w-32 rounded-xl bg-surface-soft" /></div>
    </div>
  </main>;
}
