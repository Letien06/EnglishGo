import { notFound } from "next/navigation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { getDictationCatalog, getDictationSet } from "@/lib/services/dautoeic-dictation";
import AudioDictationClient from "./AudioDictationClient";

export const dynamic = "force-dynamic";

export default async function AudioDictationPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const [catalog, user] = await Promise.all([getDictationCatalog(), getCurrentUserForRead()]);
  const set = catalog.sets.find(item => item.id === setId);
  if (!set) notFound();
  const session = await getDictationSet(setId);
  return <AudioDictationClient key={`${user?.uid || "guest"}:${setId}`} set={set} session={session} learnerId={user?.uid || "guest"} />;
}
