import { getCurrentUser } from "@/lib/auth/session";
import { getStudyStreakLeaderboard } from "@/lib/services/study-activity";

export const dynamic = "force-dynamic";

export default async function StreakLeaderboardPage() {
  const [user, entries] = await Promise.all([
    getCurrentUser(),
    getStudyStreakLeaderboard(100),
  ]);

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#f1f5fb] px-5 py-8 lg:px-8">
      <section className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
              Streak leaderboard
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-ink">
              Bang xep hang chuoi hoc
            </h1>
            <p className="mt-2 text-sm text-muted">
              Xep hang toi da 100 nguoi co chuoi hoc lien tiep cao nhat.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm font-extrabold text-primary shadow-sm">
            <span aria-hidden="true">&#128293;</span> {entries.length}/100 nguoi
          </div>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-line bg-white shadow-sm">
          <div className="grid grid-cols-[88px_1fr_112px] border-b border-line bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-600">
            <span>Hang</span>
            <span>Nguoi dung</span>
            <span className="text-right">Streak</span>
          </div>

          {entries.length === 0 ? (
            <div className="p-10 text-center text-muted">
              Chua co du lieu chuoi hoc. Hay hoc mot bai de xuat hien tren bang xep hang.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {entries.map((entry) => (
                <article
                  key={entry.uid}
                  className={`grid grid-cols-[88px_1fr_112px] items-center px-5 py-4 ${
                    entry.uid === user?.uid ? "bg-amber-50/70" : "bg-white"
                  }`}
                >
                  <RankBadge rank={entry.rank} />
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar
                      name={entry.displayName ?? entry.email ?? "Learner"}
                      avatarUrl={entry.avatarUrl}
                    />
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-extrabold text-ink">
                        {entry.displayName ?? entry.email ?? "Learner"}
                        {entry.uid === user?.uid ? (
                          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                            Ban
                          </span>
                        ) : null}
                      </h2>
                      {entry.studiedToday ? (
                        <p className="mt-0.5 text-xs font-bold text-emerald-600">
                          Hom nay da hoc {entry.todayActivityCount} hoat dong
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs font-bold text-muted">
                          Chua hoc hom nay
                        </p>
                      )}
                    </div>
                  </div>
                  <strong className="text-right text-lg font-extrabold text-orange-500">
                    {entry.streakDays} <span aria-hidden="true">&#128293;</span>
                  </strong>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xl" aria-hidden="true">&#127941;</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-400 px-1 text-[11px] font-extrabold text-white">
          {rank}
        </span>
      </div>
    );
  }

  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-extrabold text-slate-700">
      {rank}
    </span>
  );
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "E";
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-extrabold text-gold-ink">
      {initial}
    </span>
  );
}
