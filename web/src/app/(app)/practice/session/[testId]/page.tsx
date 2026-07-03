import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getPracticeSession } from "@/lib/services/practice";
import PracticeSessionClient from "./PracticeSessionClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ testId: string }>;
}

export default async function PracticeSessionPage({ params }: Props) {
  const user = await requireUser();
  const { testId } = await params;
  const session = await getPracticeSession(Number(testId), user.uid);

  return (
    <>
      <AppTopbar
        pageTitle={session.test.title}
        pageSubtitle={`${session.test.type} / ${session.test.difficulty ?? "Any difficulty"}`}
        userName={user.displayName}
        userEmail={user.email}
      />
      <PracticeSessionClient session={session} />
    </>
  );
}
