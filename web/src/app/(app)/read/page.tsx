import * as dautoeic from "@/lib/services/dautoeic";
import StudyDashboard from "../_components/StudyDashboard";

export default async function ReadPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  const params = await searchParams;
  const parsed = Number(params.part?.replace(/^part/, ""));
  const part = Number.isInteger(parsed) && parsed >= 5 && parsed <= 7 ? parsed : 5;
  const initial = await dautoeic.listReadingDifficultyLevels(part).then((levels) => ({ levels, error: false })).catch(() => ({ levels: [], error: true }));
  return <StudyDashboard skill="reading" part={part} {...initial} />;
}
