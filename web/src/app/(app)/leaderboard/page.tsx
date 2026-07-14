import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getPracticeLeaderboard,
  normalizeLeaderboardPeriod,
  normalizeLeaderboardScope,
  practiceLeaderboardLabel,
  type PracticeLeaderboardEntry,
  type PracticeLeaderboardPeriod,
  type PracticeLeaderboardScope,
} from "@/lib/services/leaderboard";
import { getStudyStreakLeaderboard, type StudyStreakLeaderboardEntry } from "@/lib/services/study-activity";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type LeaderboardTab = "streak" | "listening" | "reading" | "exam" | "weekly";

export default async function LeaderboardPage({ searchParams }: Props) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const tab = normalizeTab(singleValue(sp.tab));
  const period = tab === "weekly" ? "WEEKLY" : normalizeLeaderboardPeriod(singleValue(sp.period));
  const scope = tab === "weekly" ? "EXAM" : scopeForTab(tab);

  const [streakEntries, practiceEntries] = tab === "streak"
    ? [await getStudyStreakLeaderboard(100), [] as PracticeLeaderboardEntry[]]
    : [[] as StudyStreakLeaderboardEntry[], await getPracticeLeaderboard(scope, period, 100)];

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-bg px-5 py-8 lg:px-8">
      <section className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
              Bảng xếp hạng
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-ink">
              Bảng xếp hạng học tập TOEIC
            </h1>
            <p className="mt-2 text-sm text-muted">
              Điểm nghe, đọc và đề thi chỉ tính bài làm hợp lệ; làm lại vẫn lưu lịch sử nhưng không cộng dồn vào bảng xếp hạng.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm font-extrabold text-primary shadow-sm">
            {tab === "streak" ? `${streakEntries.length}/100 người` : `${practiceEntries.length}/100 lượt xếp hạng`}
          </div>
        </header>

        <nav className="flex flex-wrap gap-2" aria-label="Các bảng xếp hạng">
          <TabLink href="/leaderboard?tab=streak" active={tab === "streak"} label="Chuỗi học" />
          <TabLink href="/leaderboard?tab=listening" active={tab === "listening"} label="Nghe" />
          <TabLink href="/leaderboard?tab=reading" active={tab === "reading"} label="Đọc" />
          <TabLink href="/leaderboard?tab=exam" active={tab === "exam"} label="Đề thi" />
          <TabLink href="/leaderboard?tab=weekly" active={tab === "weekly"} label="Tuần này" />
        </nav>

        {tab !== "streak" && tab !== "weekly" ? (
          <nav className="flex gap-2" aria-label="Khoảng thời gian xếp hạng">
            <TabLink
              href={`/leaderboard?tab=${tab}&period=all-time`}
              active={period === "ALL_TIME"}
              label="Tất cả"
              compact
            />
            <TabLink
              href={`/leaderboard?tab=${tab}&period=weekly`}
              active={period === "WEEKLY"}
              label="Tuần này"
              compact
            />
          </nav>
        ) : null}

        {tab === "streak" ? (
          <StreakBoard entries={streakEntries} currentUid={user?.uid ?? null} />
        ) : (
          <PracticeBoard
            entries={practiceEntries}
            currentUid={user?.uid ?? null}
            scope={scope}
            period={period}
          />
        )}
      </section>
    </main>
  );
}

function PracticeBoard({
  entries,
  currentUid,
  scope,
  period,
}: {
  entries: PracticeLeaderboardEntry[];
  currentUid: string | null;
  scope: PracticeLeaderboardScope;
  period: PracticeLeaderboardPeriod;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-line bg-white shadow-sm">
      <div className="grid grid-cols-[72px_1fr_120px_120px_96px] gap-3 border-b border-line bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-600 max-md:grid-cols-[56px_1fr_96px]">
        <span>Hạng</span>
        <span>Người dùng</span>
        <span className="text-right">Điểm</span>
        <span className="text-right max-md:hidden">Đúng</span>
        <span className="text-right max-md:hidden">Thời gian</span>
      </div>

      {entries.length === 0 ? (
        <div className="p-10 text-center text-muted">
          Chưa có bài làm hợp lệ cho bảng xếp hạng {practiceLeaderboardLabel(scope)} {period === "WEEKLY" ? "tuần này" : "tất cả"}.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {entries.map((entry) => (
            <article
              key={entry.uid}
              className={`grid grid-cols-[72px_1fr_120px_120px_96px] items-center gap-3 px-5 py-4 max-md:grid-cols-[56px_1fr_96px] ${
                entry.uid === currentUid ? "bg-amber-50/70" : "bg-white"
              }`}
            >
              <RankBadge rank={entry.rank} />
              <div className="flex min-w-0 items-center gap-4">
                <Avatar name={entry.displayName ?? entry.email ?? "Người học"} avatarUrl={entry.avatarUrl} />
                <div className="min-w-0">
                  <h2 className="truncate text-base font-extrabold text-ink">
                    {entry.displayName ?? entry.email ?? "Người học"}
                    {entry.uid === currentUid ? (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                        Bạn
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 truncate text-xs font-bold text-muted">
                    Bài làm {practiceLeaderboardLabel(entry.scope)} hợp lệ
                  </p>
                </div>
              </div>
              <strong className="text-right text-lg font-extrabold text-primary">
                {scoreText(entry)}
              </strong>
              <span className="text-right text-sm font-bold text-ink max-md:hidden">
                {entry.correctCount}/{entry.questionCount}
              </span>
              <span className="text-right text-sm text-muted max-md:hidden">
                {formatElapsed(entry.elapsedMillis)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StreakBoard({
  entries,
  currentUid,
}: {
  entries: StudyStreakLeaderboardEntry[];
  currentUid: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-line bg-white shadow-sm">
      <div className="grid grid-cols-[88px_1fr_112px] border-b border-line bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-600">
        <span>Hạng</span>
        <span>Người dùng</span>
        <span className="text-right">Chuỗi học</span>
      </div>

      {entries.length === 0 ? (
        <div className="p-10 text-center text-muted">
          Chưa có dữ liệu chuỗi học. Hãy học một bài để xuất hiện trên bảng xếp hạng.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {entries.map((entry) => (
            <article
              key={entry.uid}
              className={`grid grid-cols-[88px_1fr_112px] items-center px-5 py-4 ${
                entry.uid === currentUid ? "bg-amber-50/70" : "bg-white"
              }`}
            >
              <RankBadge rank={entry.rank} />
              <div className="flex min-w-0 items-center gap-4">
                <Avatar name={entry.displayName ?? entry.email ?? "Người học"} avatarUrl={entry.avatarUrl} />
                <div className="min-w-0">
                  <h2 className="truncate text-base font-extrabold text-ink">
                    {entry.displayName ?? entry.email ?? "Người học"}
                    {entry.uid === currentUid ? (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">
                        Bạn
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 text-xs font-bold text-muted">
                    {entry.studiedToday ? `Hôm nay đã học ${entry.todayActivityCount} hoạt động` : "Chưa học hôm nay"}
                  </p>
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
  );
}

function TabLink({
  href,
  active,
  label,
  compact = false,
}: {
  href: string;
  active: boolean;
  label: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-extrabold ${
        active ? "bg-primary text-white" : "border border-line bg-white text-ink hover:bg-surface-soft"
      }`}
    >
      {label}
    </Link>
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

function normalizeTab(value?: string | null): LeaderboardTab {
  if (value === "streak" || value === "listening" || value === "reading" || value === "exam" || value === "weekly") {
    return value;
  }
  return "streak";
}

function scopeForTab(tab: LeaderboardTab): PracticeLeaderboardScope {
  if (tab === "listening") return "LISTENING";
  if (tab === "reading") return "READING";
  return normalizeLeaderboardScope(tab);
}

function singleValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatElapsed(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} phút ${seconds} giây`;
}

function scoreText(entry: PracticeLeaderboardEntry): string {
  return entry.maxScore > 0 ? `${entry.score}/${entry.maxScore}` : `${entry.score} điểm`;
}
