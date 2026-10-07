import { listTestParts } from "@/lib/services/test-part-practice";
import StudyDashboard from "../_components/StudyDashboard";
import { listDifficultyLevels, listTests } from "@/lib/services/dautoeic";
import { listeningMetadata } from "./_components/listening-view-model";
import Link from "@/components/IntentLink";

export default async function ListenPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  const params = await searchParams;
  const parsed = Number(params.part?.replace(/^part/, ""));
  const part = Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1;
  const [initial, metadata, levels] = await Promise.all([
    listTestParts(part).then((entries) => ({ tests: entries.map((entry) => entry.test), error: false })).catch(() => ({ tests: [], error: true })),
    listTests().then(listeningMetadata).catch(() => ({})),
    listDifficultyLevels(part).catch(() => []),
  ]);
  return <>
    <div className="mx-auto w-full max-w-7xl px-5 pt-5 md:px-8">
      <Link href="/listen/audio-dictation" className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 transition-colors hover:bg-surface-soft">
        <span><strong className="block text-ink">Nghe chép</strong><span className="text-sm text-muted">Nghe từng câu · Điền từ và chép lại</span></span>
        <span aria-hidden="true" className="font-bold text-teal-ink">→</span>
      </Link>
      {levels.some((level) => (level.total ?? 0) > 0) && <nav aria-label={`Kho câu luyện Part ${part}`} className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-4">
        <span className="mr-2 text-sm font-bold text-ink">Kho câu luyện Part {part}</span>
        {levels.filter((level) => (level.total ?? 0) > 0).map((level) => <Link key={level.level} href={`/listen/practice?part=part${part}&level=${level.level}&mode=normal`} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal-ink transition-colors hover:bg-surface-soft">Nhóm {level.level} · {level.total} bài</Link>)}
      </nav>}
    </div>
    <StudyDashboard skill="listening" part={part} listeningMetadata={metadata} {...initial} />
  </>;
}
