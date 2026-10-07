import Link from "next/link";
import { getDictationCatalog } from "@/lib/services/dautoeic-dictation";

export const dynamic = "force-dynamic";

export default async function AudioDictationLibraryPage() {
  const catalog = await getDictationCatalog();
  const sets = [...catalog.sets].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.name.localeCompare(b.name));
  const groups = new Map<string, typeof sets>();
  for (const set of sets) { const name = set.collectionName || "Nghe chép"; groups.set(name, [...(groups.get(name) || []), set]); }
  return <main className="mx-auto max-w-6xl px-4 py-8">
    <Link href="/listen" className="text-sm font-bold text-primary">← Luyện nghe</Link>
    <h1 className="mt-5 text-3xl font-extrabold text-ink">Nghe chép TOEIC</h1>
    <p className="mt-3 text-muted">Nghe từng câu, điền từ hoặc chép lại toàn bộ. Tiến độ được lưu trên thiết bị này theo tài khoản.</p>
    {!sets.length && <p className="mt-8 rounded-2xl border border-line bg-surface p-6 text-muted">Thư viện nghe chép đang được cập nhật.</p>}
    {[...groups].map(([name, items]) => <section key={name} className="mt-8"><h2 className="mb-4 text-xl font-extrabold text-ink">{name}</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map(set => <Link key={set.id} href={`/listen/audio-dictation/${set.id}`} className="rounded-2xl border border-line bg-surface p-5 text-ink no-underline shadow-sm hover:border-primary"><p className="text-xs font-bold text-primary">{set.chapterName}{set.part ? ` · Part ${set.part}` : ""}</p><h3 className="mt-2 font-extrabold">{set.subtitle || set.name}</h3><p className="mt-4 text-sm text-muted">{set.itemCount} câu · Luyện tập →</p></Link>)}</div></section>)}
  </main>;
}
