import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { getCurrentUser } from "@/lib/auth/session";
import { findTests } from "@/lib/services/practice";
import PracticeTestLauncher from "./PracticeTestLauncher";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PracticePage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const tests = await findTests(
    sp.type as string | undefined,
    sp.difficulty as string | undefined,
    cursor,
    10,
  );

  return (
    <>
      <AppTopbar
        pageTitle="Practice"
        pageSubtitle="Full tests, mini tests, and TOEIC part practice"
        userName={user?.displayName}
        userEmail={user?.email}
      />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <section className="p-6 rounded-2xl bg-surface border border-line">
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
            TOEIC mock tests
          </span>
          <h1 className="text-2xl font-bold text-ink mt-1">Practice real TOEIC sets</h1>
          <p className="text-sm text-muted mt-1">
            Draft answers are saved automatically. Submit when you are ready to review score and explanations.
          </p>
        </section>

        <PracticeTestLauncher tests={tests.items} />

        {tests.items.length === 0 && (
          <section className="p-8 rounded-xl bg-surface border border-line text-center text-muted">
            No tests found.
          </section>
        )}

        {tests.nextCursor && (
          <div className="flex justify-end">
            <Link
              href={`/practice?cursor=${encodeURIComponent(tests.nextCursor)}`}
              className="px-4 py-2 rounded-lg bg-surface border border-line text-sm font-semibold text-ink"
            >
              Next
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
