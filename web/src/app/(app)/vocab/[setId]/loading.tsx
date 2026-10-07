export default function VocabSetLoading() {
  return (
    <main className="flex-1 space-y-6 overflow-y-auto px-4 py-6 lg:px-8">
      <div className="h-5 w-40 animate-pulse rounded bg-surface-soft" />
      <section className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-soft" />
        <div className="h-8 w-80 max-w-full animate-pulse rounded bg-surface-soft" />
      </section>
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="h-28 animate-pulse rounded-[26px] border-2 border-line bg-surface" />
        ))}
      </section>
      <div className="h-3 animate-pulse rounded-full bg-surface-soft" />
      <section className="h-80 animate-pulse rounded-2xl border border-line bg-surface" />
    </main>
  );
}
