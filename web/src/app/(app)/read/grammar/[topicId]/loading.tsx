export default function GrammarTopicLoading() {
  return <main aria-busy="true" aria-label="Đang tải bài ngữ pháp" className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-6 md:py-7">
    <div className="mb-6 space-y-3"><div className="h-4 w-36 rounded bg-surface-soft" /><div className="h-8 w-64 max-w-full rounded bg-surface-soft" /></div>
    <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_310px]">
      <div className="rounded-2xl border border-line bg-surface p-5"><div className="h-5 w-28 rounded bg-surface-soft xl:hidden" /><div className="hidden space-y-4 xl:block">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-16 rounded-xl bg-surface-soft" />)}</div></div>
      <div className="min-h-[380px] space-y-5 rounded-2xl border border-line bg-surface p-7"><div className="h-5 w-24 rounded bg-surface-soft" /><div className="h-16 rounded bg-surface-soft" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 rounded-xl bg-surface-soft" />)}</div>
      <div className="min-h-[380px] rounded-2xl border border-line bg-surface p-5"><div className="h-5 w-24 rounded bg-surface-soft" /><div className="mt-5 h-28 rounded-xl border border-dashed border-line" /></div>
    </div>
  </main>;
}
