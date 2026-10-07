/**
 * Reading Practice — `/read/practice`
 *
 * Server component that loads the practice session data from DauToeic,
 * then renders the client-side interactive practice component.
 *
 * Port of `ReadController.practice()` + `read/practice.html`.
 */
import PracticeUnavailable from "../../_components/PracticeUnavailable";
import { getReadIdentity } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import { getTestPartSession } from "@/lib/services/test-part-practice";
import { DAUTOEIC_LEVEL_COUNT } from "@/lib/services/dautoeic-source";
import ReadPracticeClient from "./ReadPracticeClient";

function partNumber(partId: string): number {
  switch (partId) {
    case "part5": return 5;
    case "part6": return 6;
    case "part7": return 7;
    default: return 5;
  }
}

export default async function ReadPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string; level?: string; testId?: string; mode?: string; q?: string }>;
}) {
  const params = await searchParams;
  const partId = params.part && ["part5", "part6", "part7"].includes(params.part)
    ? params.part
    : "part5";
  const pNum = partNumber(partId);
  const level = Math.max(1, Math.min(DAUTOEIC_LEVEL_COUNT, Math.trunc(Number(params.level)) || 1));

  const mode = (() => {
    switch (params.mode) {
      case "bilingual":
        return params.mode;
      default:
        return "normal";
    }
  })();


  let session;
  let user;
  try {
    [session, user] = await Promise.all([
      params.testId !== undefined ? getTestPartSession(params.testId, pNum) : dautoeic.getReadingDifficultySession(pNum, level, null),
      getReadIdentity(),
    ]);
  } catch {
    return <PracticeUnavailable skill="reading" partId={partId} />;
  }

  if (!session || session.items.length === 0) {
    return <PracticeUnavailable skill="reading" partId={partId} empty />;
  }

  return (
    <ReadPracticeClient
      key={`read:${partId}:${params.testId ?? level}:${user?.uid ?? "guest"}`}
      initialIndex={Math.max(0, Math.min(session.items.length - 1, Math.trunc(Number(params.q)) || 0))}
      session={session}
      partId={partId}
      partNum={pNum}
      level={level}
      mode={mode}
      userLoggedIn={!!user}
      userUid={user?.uid ?? null}
    />
  );
}
