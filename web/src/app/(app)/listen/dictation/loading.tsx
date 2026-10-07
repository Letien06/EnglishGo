export default function DictationLoading() {
  return <main className="min-h-[calc(100dvh-4rem)] bg-[#eef4fb] px-4 py-6 lg:px-8" aria-busy="true" aria-label="Đang tải thư viện nghe chép">
    <section className="mx-auto max-w-7xl space-y-7">
      <header className="rounded-3xl bg-gradient-to-r from-blue-700 via-cyan-600 to-teal-500 p-7 text-white shadow-xl shadow-blue-900/15 sm:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-100">Listening practice</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Luyện nghe – chép theo video</h1>
        <p className="mt-3 max-w-2xl text-sm font-medium text-cyan-50 sm:text-base">Nghe từng đoạn ngắn, đi từ mức che dễ đến full dictation. Học đúng sức với video đã được tuyển chọn.</p>
      </header>
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5" aria-hidden="true"><div className="grid gap-3 md:grid-cols-[1fr_repeat(5,minmax(0,180px))]">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-11 rounded-xl bg-slate-100" />)}</div></section>
      <section role="status" aria-label="Đang tải bài nghe chép">
        <div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-bold text-primary">THƯ VIỆN</p><h2 className="text-2xl font-extrabold text-ink">Chọn bài phù hợp</h2></div><span className="text-sm font-semibold text-muted">— bài</span></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="aspect-video bg-slate-200" /><div className="space-y-3 p-4"><div className="h-3 w-1/3 rounded bg-slate-100" /><div className="h-12 rounded bg-slate-100" /><div className="h-5 w-2/3 rounded bg-slate-100" /><div className="h-4 w-1/2 rounded bg-slate-100" /></div></div>)}</div>
      </section>
    </section>
  </main>;
}
