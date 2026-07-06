import Link from "next/link";
import { redirect } from "next/navigation";
import AppTopbar from "@/components/AppTopbar";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";

interface Props {
  params: Promise<{ testId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DautoeicVocabTestPage({ params, searchParams }: Props) {
  const { testId } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const partId = typeof sp.partId === "string" ? sp.partId : undefined;
  const currentPath = `/vocab/dautoeic/${encodeURIComponent(testId)}${partId ? `?partId=${encodeURIComponent(partId)}` : ""}`;

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  const view = await dautoeicVocab.getDautoeicVocabTestView(testId, user.uid);

  if (partId) {
    const part = view.parts.find((item) => item.id === partId);
    if (!part) redirect(`/vocab/dautoeic/${encodeURIComponent(testId)}`);
    const synced = await dautoeicVocab.syncDautoeicVocabTest(testId, part.id);
    redirect(
      `/vocab/${synced.setId}/flashcards?mode=menu&partId=${encodeURIComponent(part.id)}&mastery=all&order=random&amount=all`,
    );
  }

  if (view.parts.length <= 1) {
    const onlyPart = view.parts[0];
    const synced = await dautoeicVocab.syncDautoeicVocabTest(testId, onlyPart?.id);
    const suffix = onlyPart ? `&partId=${encodeURIComponent(onlyPart.id)}` : "";
    redirect(`/vocab/${synced.setId}/flashcards?mode=menu${suffix}&mastery=all&order=random&amount=all`);
  }

  return (
    <>
      <AppTopbar
        pageTitle={view.test.name ?? "Dautoeic Vocabulary"}
        pageSubtitle={view.setName}
        userName={user.displayName}
        userEmail={user.email}
      />
      <main className="flex-1 overflow-y-auto bg-[#f1f5fb] px-5 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Link href="/vocab?tab=learn" className="text-sm font-extrabold text-primary">
            ← Quay lại từ vựng
          </Link>

          <section className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
              {view.setName}
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-ink">
              {view.test.name ?? "Vocabulary test"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Bộ này có {view.parts.length} phần. Chọn part trước, sau đó chọn game để học.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {view.parts.map((part) => {
              const percent = part.wordCount > 0
                ? Math.round((part.masteredWords / part.wordCount) * 100)
                : 0;
              return (
                <article key={part.id} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-extrabold text-ink">{part.name}</h2>
                  <p className="mt-2 text-sm text-muted">{part.wordCount} từ vựng</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted">
                    <span>{part.masteredWords}/{part.wordCount} từ đã thuộc</span>
                    {part.dueWords > 0 ? <span className="text-red-600">{part.dueWords} cần ôn</span> : null}
                  </div>
                  <Link
                    href={`/vocab/dautoeic/${encodeURIComponent(testId)}?partId=${encodeURIComponent(part.id)}`}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-emerald-300 px-4 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50"
                  >
                    Vào học
                  </Link>
                </article>
              );
            })}
          </section>
        </div>
      </main>
    </>
  );
}
