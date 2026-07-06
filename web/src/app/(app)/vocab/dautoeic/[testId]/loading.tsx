export default function DautoeicVocabTestLoading() {
  return (
    <main className="flex-1 overflow-y-auto bg-[#f1f5fb] px-5 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
        <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 h-8 w-72 max-w-full animate-pulse rounded-full bg-slate-200" />
          <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-full bg-slate-200" />
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
              <div className="h-5 w-32 animate-pulse rounded-full bg-slate-200" />
              <div className="mt-3 h-4 w-20 animate-pulse rounded-full bg-slate-200" />
              <div className="mt-4 h-2 animate-pulse rounded-full bg-slate-100" />
              <div className="mt-5 h-9 animate-pulse rounded-full bg-slate-100" />
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
