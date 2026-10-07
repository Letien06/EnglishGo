import Link from "@/components/IntentLink";
import { redirect } from "next/navigation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";
import DautoeicPartsClient from "./DautoeicPartsClient";
import { isDriveContentEnabled } from "@/lib/services/dautoeic-drive";

interface Props {
  params: Promise<{ testId: string }>;
  searchParams: Promise<{ tab?: string; intent?: string }>;
}

export default async function DautoeicVocabTestPage({ params, searchParams }: Props) {
  const { testId } = await params;
  const { tab: requestedTab, intent: requestedIntent } = await searchParams;
  const tab = requestedTab === "view" || requestedTab === "learn" || requestedTab === "play" ? requestedTab : undefined;
  const user = await getCurrentUserForRead();
  const intent = requestedIntent === "review" ? "review" : "continue";
  const currentPath = `/vocab/dautoeic/${encodeURIComponent(testId)}${tab ? `?tab=${tab}${requestedIntent === "review" ? "&intent=review" : ""}` : ""}`;

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  const view = await dautoeicVocab.getDautoeicVocabTestView(testId);
  const firstPart = view.parts.find((part) => part.wordCount > 0);
  if (tab && firstPart && isDriveContentEnabled()) {
    if (tab === "learn") {
      redirect(`/vocab/${firstPart.internalSetId}/flashcards?mode=menu&tab=learn&intent=${intent}&order=ordered&amount=all`);
    }
    redirect(`/vocab/${firstPart.internalSetId}/flashcards?mode=menu&tab=${tab}&partId=${encodeURIComponent(firstPart.id)}&mastery=all&order=ordered&amount=all`);
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-bg px-5 py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Link href="/vocab?tab=learn" className="text-sm font-extrabold text-primary">
            ← Quay lại từ vựng
          </Link>

          <section className="rounded-2xl border border-info-line bg-surface p-6 shadow-sm">
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

          <DautoeicPartsClient key={`${user.uid}:${testId}`} testId={testId} parts={view.parts} ready={isDriveContentEnabled()} tab={tab} />
        </div>
      </main>
    </>
  );
}
