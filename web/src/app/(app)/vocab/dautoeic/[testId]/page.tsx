import Link from "@/components/IntentLink";
import { redirect } from "next/navigation";
import AppTopbar from "@/components/AppTopbar";
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";
import DautoeicPartsClient from "./DautoeicPartsClient";
import { isDriveContentEnabled } from "@/lib/services/dautoeic-drive";

interface Props {
  params: Promise<{ testId: string }>;
}

export default async function DautoeicVocabTestPage({ params }: Props) {
  const { testId } = await params;
  const user = await getCurrentUserForRead();
  const currentPath = `/vocab/dautoeic/${encodeURIComponent(testId)}`;

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  const view = await dautoeicVocab.getDautoeicVocabTestView(testId);

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

          <DautoeicPartsClient key={`${user.uid}:${testId}`} testId={testId} parts={view.parts} ready={isDriveContentEnabled()} />
        </div>
      </main>
    </>
  );
}
