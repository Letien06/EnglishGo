import Link from "next/link";

const nextLessons = [
  { label: "Listening", detail: "Train your ear", href: "/listen", mark: "01" },
  { label: "Vocabulary", detail: "Build useful words", href: "/vocab", mark: "Aa" },
  { label: "Practice test", detail: "Put your skills to work", href: "/practice", mark: "✓" },
];

export default function NotFound() {
  return (
    <main className="app-canvas relative flex min-h-dvh overflow-hidden px-5 py-5 sm:px-8 sm:py-8">
      <div aria-hidden="true" className="absolute -left-32 top-20 h-80 w-80 rounded-full bg-azure/10 blur-3xl" />
      <div aria-hidden="true" className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-xl px-1 py-1 text-ink no-underline">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-base font-extrabold text-gold-ink shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_28%,transparent)]">E</span>
            <span className="text-sm font-extrabold tracking-[0.12em]">ENGLISHGO</span>
          </Link>
          <span className="hidden rounded-full border border-line bg-surface/70 px-4 py-2 text-xs font-bold tracking-wide text-muted sm:inline-flex">
            YOUR ENGLISH, YOUR WAY
          </span>
        </header>

        <section className="my-auto grid flex-1 items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] lg:gap-20 lg:py-20">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-xs font-extrabold tracking-[0.14em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              404 · OFF THE SYLLABUS
            </p>
            <h1 className="mt-6 font-serif text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-6xl lg:text-7xl">
              This page missed the <em className="text-primary">lesson.</em>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-ink2 sm:text-lg">
              The link may be misspelled, moved, or no longer available. Let&apos;s get your English journey back on track.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/practice" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-gold-ink shadow-[0_14px_28px_color-mix(in_srgb,var(--primary)_25%,transparent)] transition-transform duration-150 ease-out active:scale-[0.97] sm:justify-start">
                Take a practice test <span aria-hidden="true">→</span>
              </Link>
              <Link href="/" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-line bg-surface/75 px-6 py-3 text-sm font-extrabold text-ink transition-transform duration-150 ease-out active:scale-[0.97] sm:justify-start">
                Back to home <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>

          <aside className="relative overflow-hidden rounded-[2rem] border border-line bg-surface/85 p-6 shadow-[var(--elevation-2)] backdrop-blur sm:p-8">
            <div aria-hidden="true" className="absolute -right-14 -top-14 h-44 w-44 rounded-full border border-primary/20 shadow-[inset_0_0_0_1.5rem_color-mix(in_srgb,var(--primary)_5%,transparent),inset_0_0_0_3.2rem_color-mix(in_srgb,var(--azure)_5%,transparent)]" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold tracking-[0.15em] text-muted">WORD OF THE MOMENT</p>
                  <h2 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.04em] text-ink">misroute</h2>
                </div>
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-azure/10 text-lg font-extrabold text-azure">404</span>
              </div>
              <p className="mt-2 font-mono text-sm text-primary">/ˌmɪsˈruːt/ · verb</p>
              <p className="mt-6 border-l-2 border-primary pl-4 text-base leading-7 text-ink2">
                To send someone or something in the wrong direction.
              </p>
              <p className="mt-4 text-sm leading-6 text-muted">
                <span className="font-extrabold text-ink2">Example:</span> “I mistyped the address, so the browser took me somewhere else.”
              </p>
            </div>
          </aside>
        </section>

        <nav aria-label="Continue learning" className="border-t border-line pt-5 sm:pt-6">
          <p className="mb-3 text-xs font-extrabold tracking-[0.13em] text-muted">PICK UP A NEW LESSON</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {nextLessons.map((lesson) => (
              <Link key={lesson.label} href={lesson.href} className="group flex items-center gap-3 rounded-xl border border-line bg-surface/60 p-3.5 transition-transform duration-150 ease-out active:scale-[0.97] motion-safe:hover:-translate-y-0.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-soft text-xs font-extrabold text-primary">{lesson.mark}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm text-ink">{lesson.label}</strong>
                  <small className="block truncate pt-0.5 text-xs text-muted">{lesson.detail}</small>
                </span>
                <span aria-hidden="true" className="text-lg text-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5">→</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
