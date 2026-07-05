import { requireUser } from "@/lib/auth/session";
import { getPracticeSession } from "@/lib/services/practice";
import PracticeSessionClient from "./PracticeSessionClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ testId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PracticeSessionPage({ params, searchParams }: Props) {
  const user = await requireUser();
  const { testId } = await params;
  const sp = await searchParams;
  const session = await getPracticeSession(Number(testId), user.uid, {
    mode: typeof sp.mode === "string" ? sp.mode : null,
    parts: typeof sp.parts === "string" ? sp.parts : null,
    durationMinutes: typeof sp.time === "string" ? sp.time : null,
    resetDraft: typeof sp.reset === "string" ? sp.reset : null,
  });

  return <PracticeSessionClient session={session} />;
}
