import Link from "next/link";
import { redirect } from "next/navigation";
import AppTopbar from "@/components/AppTopbar";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";
import DautoeicPartStudyButton from "./DautoeicPartStudyButton";

interface Props {
  params: Promise<{ testId: string }>;
}

export default async function DautoeicVocabTestPage({ params }: Props) {
  const { testId } = await params;
  const user = await getCurrentUser();
  const currentPath = `/vocab/dautoeic/${encodeURIComponent(testId)}`;

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  const view = await dautoeicVocab.getDautoeicVocabTestView(testId, user.uid);

  return (
    <>
      <AppTopbar
        pageTitle={view.test.name ?? "Từ vựng TOEIC"}
        pageSubtitle={view.setName}
        userName={user.displayName}
        userEmail={user.email}
      />
      <main className="flex-1 overflow-y-auto bg-bg px-5 py-8">
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
              Bộ này có {view.parts.length} phần học được. Chọn part trước, sau đó chọn game để học.
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
                  <DautoeicPartStudyButton
                    testId={testId}
                    partId={part.id}
                    setId={part.internalSetId}
                  />
                </article>
              );
            })}
          </section>
        </div>
      </main>
    </>
  );
}
