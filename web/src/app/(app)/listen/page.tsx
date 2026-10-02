import * as dautoeic from "@/lib/services/dautoeic";
import StudyDashboard from "../_components/StudyDashboard";

export default async function ListenPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  const params = await searchParams;
  const parsed = Number(params.part?.replace(/^part/, ""));
  const part = Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1;
  const initial = await dautoeic.listDifficultyLevels(part).then((levels) => ({ levels, error: false })).catch(() => ({ levels: [], error: true }));
  return <StudyDashboard skill="listening" part={part} {...initial} />;
}
