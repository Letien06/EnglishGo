/**
 * /vocab/:setId — Vocabulary set detail page with word table + AI modal.
 *
 * Server component with client interactivity via VocabSetDetailClient.
 * Port of VocabularyController GET /vocab/sets/{setId} + set-detail.html.
 */
import Link from "next/link";
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";
import AppTopbar from "@/components/AppTopbar";
import VocabSetDetailClient from "./VocabSetDetailClient";

interface Props {
  params: Promise<{ setId: string }>;
}

export default async function VocabSetDetailPage({ params }: Props) {
  const { setId } = await params;
  const id = Number(setId);
  const user = await getCurrentUserForRead();
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

        {/* Vocabulary dashboard, search, and word management */}
        <VocabSetDetailClient
          setId={id}
          words={detail.words}
          isOwner={detail.set.ownerUid === uid}
        />
      </main>
    </>
  );
}
