import { listTestParts } from "@/lib/services/test-part-practice";
import StudyDashboard from "../_components/StudyDashboard";
import { listReadingDifficultyLevels, listTests } from "@/lib/services/dautoeic";
import { listeningMetadata } from "../listen/_components/listening-view-model";
import Link from "@/components/IntentLink";

export default async function ReadPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  const params = await searchParams;
  const parsed = Number(params.part?.replace(/^part/, ""));
  const part = Number.isInteger(parsed) && parsed >= 5 && parsed <= 7 ? parsed : 5;
  const [initial, metadata, levels] = await Promise.all([
    listTestParts(part).then((entries) => ({ tests: entries.map((entry) => entry.test), error: false })).catch(() => ({ tests: [], error: true })),
    listTests().then(listeningMetadata).catch(() => ({})),
    listReadingDifficultyLevels(part).catch(() => []),
  ]);
  const libraryTools = levels.some((level) => (level.total ?? 0) > 0) ? <nav aria-label={`Kho câu luyện Part ${part}`} className="my-5 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-4">
        <span className="mr-2 text-sm font-bold text-ink">Kho câu luyện Part {part}</span>
        {levels.filter((level) => (level.total ?? 0) > 0).map((level) => <Link key={level.level} href={`/read/practice?part=part${part}&level=${level.level}&mode=normal`} className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-teal-ink transition-colors hover:bg-surface-soft">Nhóm {level.level} · {level.total} bài</Link>)}
      </nav> : null;
  return <StudyDashboard skill="reading" part={part} listeningMetadata={metadata} libraryTools={libraryTools} {...initial} />;
}
