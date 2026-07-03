/**
 * /vocab/:setId — Vocabulary set detail page with word table + AI modal.
 *
 * Server component with client interactivity via VocabSetDetailClient.
 * Port of VocabularyController GET /vocab/sets/{setId} + set-detail.html.
 */
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";
import AppTopbar from "@/components/AppTopbar";
import VocabSetDetailClient from "./VocabSetDetailClient";

interface Props {
  params: Promise<{ setId: string }>;
}

export default async function VocabSetDetailPage({ params }: Props) {
  const { setId } = await params;
  const id = Number(setId);
  const user = await getCurrentUser();
  const uid = user?.uid ?? "";

  const detail = await vocab.getSetDetail(id, uid);

  return (
    <>
      <AppTopbar
        pageTitle={detail.set.title}
        pageSubtitle={detail.set.topic}
        userName={user?.displayName}
        userEmail={user?.email}
      />

      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        {/* Back link */}
        <Link href="/vocab" className="text-accent text-sm">
          ← Quay lại danh sách
        </Link>

        {/* Heading */}
        <section>
          <span className="text-xs uppercase tracking-widest text-muted font-semibold">
            {detail.set.topic}
          </span>
          <h1 className="text-2xl font-bold text-ink mt-1">
            {detail.set.title}
          </h1>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatBox label="Tổng từ" value={detail.totalWords} />
          <StatBox label="Thành thạo" value={detail.masteredWords} />
          <StatBox
            label="Đang học"
            value={detail.totalWords - detail.masteredWords}
          />
          <StatBox label="Tiến trình" value={`${detail.progressPercent}%`} />
        </div>

        {/* Progress bar */}
        <div className="h-3 rounded-full bg-surface-soft overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-green-400 transition-all"
            style={{ width: `${detail.progressPercent}%` }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <Link
            href={`/vocab/${id}/flashcards`}
            className="px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors no-underline"
          >
            🃏 Flashcards
          </Link>
          <Link
            href={`/vocab/${id}/flashcards?mode=quiz`}
            className="px-5 py-2.5 rounded-lg bg-surface border border-line text-ink2 text-sm font-semibold hover:bg-surface-soft transition-colors no-underline"
          >
            📝 Quiz
          </Link>
        </div>

        {/* Client component for word table + AI modal */}
        <VocabSetDetailClient
          setId={id}
          words={detail.words}
          isOwner={detail.set.ownerUid === uid}
        />
      </main>
    </>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <article className="p-4 rounded-xl bg-surface border border-line">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </article>
  );
}
