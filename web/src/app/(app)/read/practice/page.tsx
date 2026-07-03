/**
 * Reading Practice — `/read/practice`
 *
 * Server component that loads the practice session data from DauToeic,
 * then renders the client-side interactive practice component.
 *
 * Port of `ReadController.practice()` + `read/practice.html`.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
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
  searchParams: Promise<{ part?: string; level?: string; mode?: string; assist?: string }>;
}) {
  const params = await searchParams;
  const partId = params.part && ["part5", "part6", "part7"].includes(params.part)
    ? params.part
    : "part5";
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

  const user = await getCurrentUser();

  let session;
  try {
    session = await dautoeic.getReadingDifficultySession(pNum, level, null);
  } catch {
    redirect(`/read?part=${partId}`);
  }

  if (!session || session.items.length === 0) {
    redirect(`/read?part=${partId}`);
  }

  return (
    <ReadPracticeClient
      session={session}
      partId={partId}
      partNum={pNum}
      level={level}
      mode={mode}
      assist={assist}
      userLoggedIn={!!user}
    />
  );
}
