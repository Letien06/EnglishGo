"use client";

interface AppTopbarProps {
  pageTitle: string;
  pageSubtitle?: string;
  userName?: string | null;
  userEmail?: string | null;
}

export default function AppTopbar({
  pageTitle,
  pageSubtitle,
}: AppTopbarProps) {
  return (
    <header className="border-b border-line bg-bg px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
          Không gian học tập
        </p>
        <h1 className="mt-3 break-words font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{pageTitle}</h1>
        {pageSubtitle && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{pageSubtitle}</p>
        )}
      </div>
    </header>
  );
}
