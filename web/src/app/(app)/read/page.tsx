import { listTestParts } from "@/lib/services/test-part-practice";
import StudyDashboard from "../_components/StudyDashboard";

export default async function ReadPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  const params = await searchParams;
  const parsed = Number(params.part?.replace(/^part/, ""));
  const part = Number.isInteger(parsed) && parsed >= 5 && parsed <= 7 ? parsed : 5;
  const initial = await listTestParts(part).then((entries) => ({ tests: entries.map((entry) => entry.test), error: false })).catch(() => ({ tests: [], error: true }));
  return <StudyDashboard skill="reading" part={part} {...initial} />;
}
