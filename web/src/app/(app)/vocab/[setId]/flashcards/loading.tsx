export default function FlashcardsLoading() {
  return (
    <main className="flex-1 space-y-6 overflow-y-auto px-4 py-6 lg:px-8">
      <div className="h-5 w-32 animate-pulse rounded bg-surface-soft" />
      <section className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-surface-soft" />
        <div className="h-7 w-72 max-w-full animate-pulse rounded bg-surface-soft" />
        <div className="h-4 w-32 animate-pulse rounded bg-surface-soft" />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-2xl border border-line bg-surface" />
        ))}
      </section>
    </main>
  );
}
