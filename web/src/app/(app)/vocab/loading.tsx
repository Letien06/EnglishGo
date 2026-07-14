export default function VocabLoading() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-bg px-5 py-10">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="h-48 animate-pulse rounded-3xl border border-amber-200 bg-white shadow-sm" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} className="h-10 w-32 animate-pulse rounded-full bg-white" />
          ))}
        </div>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <article key={index} className="h-44 animate-pulse rounded-2xl border border-amber-100 bg-white p-5 shadow-sm" />
          ))}
        </section>
      </div>
    </main>
  );
}
