import { listTestParts } from "@/lib/services/test-part-practice";
import StudyDashboard from "../_components/StudyDashboard";
import { listTests } from "@/lib/services/dautoeic";
import { listeningMetadata } from "./_components/listening-view-model";

export default async function ListenPage({ searchParams }: { searchParams: Promise<{ part?: string }> }) {
  const params = await searchParams;
  const parsed = Number(params.part?.replace(/^part/, ""));
  const part = Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : 1;
  const [initial, metadata] = await Promise.all([
    listTestParts(part).then((entries) => ({ tests: entries.map((entry) => entry.test), error: false })).catch(() => ({ tests: [], error: true })),
    listTests().then(listeningMetadata).catch(() => ({})),
  ]);
  return <StudyDashboard skill="listening" part={part} listeningMetadata={metadata} {...initial} />;
}
