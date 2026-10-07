import Link from "@/components/IntentLink";
import { getGrammarCatalog } from "@/lib/services/dautoeic-grammar";

export default async function GrammarPage() {
  const catalog = await getGrammarCatalog();
  return <main className="mx-auto w-full max-w-5xl p-5 md:p-8">
    <Link href="/read" className="text-sm font-bold text-teal-ink">← Luyện đọc</Link>
    <h1 className="mt-5 text-3xl font-extrabold text-ink">Ngữ pháp</h1>
    <p className="mt-2 text-muted">Luyện theo chủ đề, xem đáp án và giải thích sau mỗi câu.</p>
    {!catalog?.topics.length ? <p className="mt-8 rounded-2xl border border-line bg-surface p-5">Chưa có bài ngữ pháp. Vui lòng thử lại sau.</p> : <div className="mt-7 grid gap-4 sm:grid-cols-2">
      {catalog.topics.map((topic) => <Link key={topic.id} href={`/read/grammar/${encodeURIComponent(topic.slug)}`} className="rounded-2xl border border-line bg-surface p-5 transition-colors hover:bg-surface-soft">
        {topic.bigTopic && <p className="text-xs font-bold text-muted">{topic.bigTopic}</p>}
        <h2 className="mt-1 text-lg font-extrabold text-ink">{topic.title}</h2>
        <p className="mt-2 text-sm text-muted">{topic.questionCount} câu · {topic.subtopics.length} chuyên đề</p>
      </Link>)}
    </div>}
  </main>;
}
