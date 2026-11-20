import Link from "@/components/IntentLink";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { getDictationCatalog } from "@/lib/services/dautoeic-dictation";
import AudioDictationLibraryClient from "./AudioDictationLibraryClient";

export const dynamic = "force-dynamic";

export default async function AudioDictationLibraryPage() {
  const [catalog, user] = await Promise.all([getDictationCatalog(), getCurrentUserForRead()]);
  const sets = [...catalog.sets].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.name.localeCompare(b.name));
  return <main className="mx-auto max-w-6xl px-4 py-8">
    <Link href="/listen" className="text-sm font-bold text-primary">← Luyện nghe</Link>
    <h1 className="mt-5 text-3xl font-extrabold text-ink">Nghe chép TOEIC</h1>
    <p className="mt-3 text-muted">Nghe từng câu, điền từ hoặc chép lại toàn bộ. Tiến độ được lưu trên thiết bị này theo tài khoản.</p>
    {!sets.length && <p className="mt-8 rounded-2xl border border-line bg-surface p-6 text-muted">Thư viện nghe chép đang được cập nhật.</p>}
    <AudioDictationLibraryClient sets={sets} learnerId={user?.uid || "guest"} />
  </main>;
}
