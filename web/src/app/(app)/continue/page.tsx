import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getContinueLearning } from "@/lib/services/continue-learning";

export const dynamic = "force-dynamic";

export default async function ContinuePage() {
  const user = await requireUser();
  const view = await getContinueLearning(user);

  return (
    <>
      <AppTopbar
        pageTitle="Hoc tiep"
        pageSubtitle="Resume drafts and review the next best activity"
        userName={user.displayName}
        userEmail={user.email}
      />
      <main className="continue-page app-canvas flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            <article className="continue-card rounded-xl border border-line bg-surface p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">SRS vocab</p>
              <h2 className="mt-2 text-3xl font-extrabold text-ink">{view.dueVocabWords}</h2>
              <p className="mt-1 text-sm text-muted">tu vung den han on hom nay</p>
              <Link
                href="/vocab?tab=progress"
                className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink"
              >
                On tu
              </Link>
            </article>

            <article className="continue-card rounded-xl border border-line bg-surface p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Goi y practice</p>
              {view.nextPracticeRecommendation ? (
                <>
                  <h2 className="mt-2 text-xl font-extrabold text-ink">{view.nextPracticeRecommendation.label}</h2>
                  <p className="mt-1 text-sm text-muted">{view.nextPracticeRecommendation.reason}</p>
                  <Link
                    href={view.nextPracticeRecommendation.href}
                    className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-extrabold text-white"
                  >
                    Luyen tiep
                  </Link>
                </>
              ) : (
                <>
                  <h2 className="mt-2 text-xl font-extrabold text-ink">Chua co diem yeu moi</h2>
                  <p className="mt-1 text-sm text-muted">Lam mot part practice de he thong goi y lan tiep theo.</p>
                  <Link
                    href="/practice"
                    className="mt-4 inline-flex rounded-lg border border-line px-4 py-2 text-sm font-extrabold text-ink"
                  >
                    Chon bai luyen
                  </Link>
                </>
              )}
            </article>
          </section>

          <section className="continue-list rounded-xl border border-line bg-surface">
            <div className="border-b border-line p-5">
              <h2 className="text-lg font-extrabold text-ink">Draft bai thi dang lam</h2>
              <p className="mt-1 text-sm text-muted">Lay tu server-side draft gan nhat, uu tien cau dang lam do.</p>
            </div>
            {view.practiceDrafts.length ? (
              <div className="divide-y divide-line">
                {view.practiceDrafts.map((draft) => (
                  <Link key={`${draft.testId}-${draft.updatedAtMillis}`} href={draft.href} className="block p-5 hover:bg-surface-soft">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-ink">{draft.title}</h3>
                        <p className="mt-1 text-sm text-muted">
                          {draft.mode === "exam" ? "Full test" : `Parts ${draft.parts.join(", ")}`} - da tra loi {draft.answeredCount} cau - dang o cau {draft.currentQuestionIndex + 1}
                        </p>
                      </div>
                      <span className="text-sm font-extrabold text-accent">Tiep tuc</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted">Chua co draft bai thi dang lam.</div>
            )}
          </section>

          <section className="continue-list rounded-xl border border-line bg-surface">
            <div className="border-b border-line p-5">
              <h2 className="text-lg font-extrabold text-ink">Vocab gan day</h2>
              <p className="mt-1 text-sm text-muted">Dung de xem lai chat luong buoi hoc va quay lai vocab nhanh.</p>
            </div>
            {view.recentVocabHistory.length ? (
              <div className="divide-y divide-line">
                {view.recentVocabHistory.map((item) => (
                  <article key={item.id} className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-ink">{item.title}</h3>
                        <p className="mt-1 text-sm text-muted">{item.mode} - {item.accuracy}% dung</p>
                      </div>
                      <span className="text-sm font-extrabold text-ink">{item.score} diem</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted">Chua co lich su vocab gan day.</div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
