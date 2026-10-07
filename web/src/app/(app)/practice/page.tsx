import Link from "next/link";
import { findTests } from "@/lib/services/practice";
import PracticeTestLauncher from "./PracticeTestLauncher";
import PracticePageHeading from "./PracticePageHeading";
import styles from "../listen/_components/listening.module.css";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PracticePage({ searchParams }: Props) {
  const sp = await searchParams;
  const cursor = typeof sp.cursor === "string" ? sp.cursor : null;
  const tests = await findTests(
    sp.type as string | undefined,
    sp.difficulty as string | undefined,
    cursor,
    10,
  );

  return (
      <main className={`${styles.dashboard} w-full min-w-0 flex-1 space-y-6`}>
        <PracticePageHeading title="Luyện đề TOEIC" subtitle="Thi thử trọn bộ hoặc luyện từng Part, theo nhịp học của bạn." />
        <PracticeTestLauncher tests={tests.items} />

        {tests.items.length === 0 && (
          <section className="practice-empty-state p-8 rounded-xl bg-surface border border-line text-center text-muted">
            Chưa có đề thi phù hợp.
          </section>
        )}

        {tests.nextCursor && (
          <div className="flex justify-end">
            <Link
              href={`/practice?cursor=${encodeURIComponent(tests.nextCursor)}`}
              className="practice-next-link px-4 py-2 rounded-lg bg-surface border border-line text-sm font-semibold text-ink"
            >
              Trang tiếp
            </Link>
          </div>
        )}
      </main>
  );
}
