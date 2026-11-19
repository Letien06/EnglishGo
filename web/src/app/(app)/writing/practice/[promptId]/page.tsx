import { getReadIdentity } from "@/lib/auth/session";
import { getWritingPrompt } from "@/lib/services/writing";
import WritingPracticeClient from "./WritingPracticeClient";

export const dynamic = "force-dynamic";

export default async function WritingPracticePage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const [identity, initialPrompt] = await Promise.all([
    getReadIdentity().catch(() => null),
    getWritingPrompt(promptId).catch(() => null),
  ]);
  return (
    <WritingPracticeClient
      promptId={promptId}
      uid={identity?.uid ?? null}
      initialPrompt={initialPrompt}
    />
  );
}
