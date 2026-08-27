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
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const [user, tests] = await Promise.all([
    getCurrentUser(),
    findTests(
      sp.type as string | undefined,
      sp.difficulty as string | undefined,
      cursor,
      10,
    ),
  ]);

  return (
    <>
      <AppTopbar
        pageTitle="Practice"
        pageSubtitle="Full tests, mini tests, and TOEIC part practice"
        userName={user?.displayName}
        userEmail={user?.email}
      />
      <main className="app-canvas practice-page flex-1 space-y-6 overflow-y-auto px-4 py-6 lg:px-8">
        <PracticeTestLauncher tests={tests.items} />

        {tests.items.length === 0 && (
          <section className="practice-empty-state p-8 rounded-xl bg-surface border border-line text-center text-muted">
            No tests found.
          </section>
        )}

        {tests.nextCursor && (
          <div className="flex justify-end">
            <Link
              href={`/practice?cursor=${encodeURIComponent(tests.nextCursor)}`}
              className="practice-next-link px-4 py-2 rounded-lg bg-surface border border-line text-sm font-semibold text-ink"
            >
              Next
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
