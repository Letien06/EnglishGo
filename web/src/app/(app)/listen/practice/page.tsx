/**
 * Listening Practice — `/listen/practice`
 *
 * Server component that loads the practice session data from DauToeic,
 * then renders the client-side interactive practice component.
 *
 * Port of `ListenController.practice()` + `listen/practice.html`.
 */
import { redirect } from "next/navigation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import * as listening from "@/lib/services/listening";
import ListenPracticeClient from "./ListenPracticeClient";

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
  searchParams: Promise<{ part?: string; level?: string; mode?: string; assist?: string }>;
}) {
  const params = await searchParams;
  const partId = params.part && ["part1", "part2", "part3", "part4"].includes(params.part)
    ? params.part
    : "part1";
  const pNum = partNumber(partId);
  const level = Math.max(1, Math.min(5, Number(params.level) || 1));

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

  const user = await getCurrentUserForRead();

  let session;
  try {
    session = await dautoeic.getDifficultySession(pNum, level, null);
  } catch (error) {
    console.error("listen-practice-session-failed", {
      part: pNum,
      level,
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(`/listen?part=${partId}`);
  }

  if (!session || session.items.length === 0) {
    console.warn("listen-practice-session-empty", {
      part: pNum,
      level,
      total: session?.total ?? 0,
    });
    redirect(`/listen?part=${partId}`);
  }

  // Restore previously saved answers so the practice UI resumes where the
  // learner left off (fixes progress showing on dashboard but resetting here).
  let savedAnswers: Record<string, string> = {};
  if (user) {
    try {
      savedAnswers = await listening.loadAnswers(user.uid, pNum, level);
    } catch {
      // Best-effort: fall back to a fresh session if progress cannot be read.
      savedAnswers = {};
    }
  }

  return (
    <ListenPracticeClient
      session={session}
      partId={partId}
      partNum={pNum}
      level={level}
      mode={mode}
      assist={assist}
      userLoggedIn={!!user}
      userUid={user?.uid ?? null}
      savedAnswers={savedAnswers}
    />
  );
}
