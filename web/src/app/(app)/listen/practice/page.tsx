/**
 * Listening Practice — `/listen/practice`
 *
 * Server component that loads the practice session data from DauToeic,
 * then renders the client-side interactive practice component.
 *
 * Port of `ListenController.practice()` + `listen/practice.html`.
 */
import { getReadIdentity } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import { getTestPartSession } from "@/lib/services/test-part-practice";
import { DAUTOEIC_LEVEL_COUNT } from "@/lib/services/dautoeic-source";
import ListenPracticeClient from "./ListenPracticeClient";
import PracticeUnavailable from "../../_components/PracticeUnavailable";

function partNumber(partId: string): number {
  switch (partId) {
    case "part1": return 1;
    case "part2": return 2;
    case "part3": return 3;
    case "part4": return 4;
    default: return 1;
  }
}

export default async function ListenPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string; level?: string; testId?: string; mode?: string; q?: string; assist?: string }>;
}) {
  const params = await searchParams;
  const partId = params.part && ["part1", "part2", "part3", "part4"].includes(params.part)
    ? params.part
    : "part1";
  const pNum = partNumber(partId);
  const level = Math.max(1, Math.min(DAUTOEIC_LEVEL_COUNT, Math.trunc(Number(params.level)) || 1));

  const mode = (() => {
    switch (params.mode) {
      case "bilingual":
      case "fill":
      case "flip":
        return params.mode;
      default:
        return "normal";
    }
  })();

  const assist = (() => {
    const v = Number(params.assist);
    switch (v) {
      case 30:
      case 50:
      case 100:
        return v;
      default:
        return 30;
    }
  })();


  let session;
  let user;
  try {
    [session, user] = await Promise.all([
      params.testId !== undefined ? getTestPartSession(params.testId, pNum) : dautoeic.getDifficultySession(pNum, level, null),
      getReadIdentity(),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("listen-practice-session-failed", {
      part: pNum,
      level,
      message,
    });
    return <PracticeUnavailable skill="listening" partId={partId} />;
  }

  if (!session || session.items.length === 0) {
    console.warn("listen-practice-session-empty", {
      part: pNum,
      level,
      total: session?.total ?? 0,
    });
    return (
      <PracticeUnavailable skill="listening" partId={partId} empty />
    );
  }

  return (
    <ListenPracticeClient
      key={`listen:${partId}:${params.testId ?? level}:${user?.uid ?? "guest"}`}
      initialIndex={Math.max(0, Math.min(session.items.length - 1, Math.trunc(Number(params.q)) || 0))}
      session={session}
      partId={partId}
      partNum={pNum}
      level={level}
      mode={mode}
      assist={assist}
      userLoggedIn={!!user}
      userUid={user?.uid ?? null}
    />
  );
}
