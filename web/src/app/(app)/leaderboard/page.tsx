import Link from "next/link";
import { getCurrentUserForRead } from "@/lib/auth/session";
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
  const [user, sp] = await Promise.all([getCurrentUserForRead(), searchParams]);
  const tab = normalizeTab(singleValue(sp.tab));
  const period = tab === "weekly" ? "WEEKLY" : normalizeLeaderboardPeriod(singleValue(sp.period));
  const scope = tab === "weekly" ? "EXAM" : scopeForTab(tab);

  const [streakEntries, practiceEntries] = tab === "streak"
    ? [await getStudyStreakLeaderboard(100), [] as PracticeLeaderboardEntry[]]
    : [[] as StudyStreakLeaderboardEntry[], await getPracticeLeaderboard(scope, period, 100)];

  return (
    <main className="app-canvas leaderboard-page min-h-[calc(100dvh-4rem)] bg-bg px-5 py-8 lg:px-8">
      <section className="leaderboard-shell mx-auto max-w-6xl space-y-5">
        <header className="leaderboard-summary flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
              Bảng xếp hạng
            </p>
            <h1 className="mt-2 text-3xl font-extrabold text-ink">
              Bảng xếp hạng học tập TOEIC
            </h1>
            <p className="mt-2 text-sm text-ink3 max-w-2xl leading-relaxed">
              Điểm nghe, đọc và đề thi chỉ tính bài làm hợp lệ; làm lại vẫn lưu lịch sử nhưng không cộng dồn vào bảng xếp hạng.
            </p>
          </div>
          <div className="leaderboard-count rounded-2xl border border-primary/25 bg-surface/90 px-4 py-3 text-sm font-extrabold text-primary shadow-sm backdrop-blur-md">
            {tab === "streak"
              ? `${streakEntries.length}/100 người`
              : `${practiceEntries.length}/100 lượt xếp hạng`}
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
    <section className="leaderboard-board overflow-hidden rounded-[28px] border border-line bg-surface shadow-sm">
      <div className="grid grid-cols-[72px_1fr_120px_120px_96px] gap-3 border-b border-line bg-surface-soft/80 px-5 py-3.5 text-xs font-extrabold uppercase tracking-wider text-ink3 max-md:grid-cols-[56px_1fr_96px]">
        <span>Hạng</span>
        <span>Người dùng</span>
        <span className="text-right">Điểm</span>
        <span className="text-right max-md:hidden">Đúng</span>
        <span className="text-right max-md:hidden">Thời gian</span>
      </div>

      {entries.length === 0 ? (
        <div className="p-12 text-center text-ink3">
          Chưa có bài làm hợp lệ cho bảng xếp hạng {practiceLeaderboardLabel(scope)} {period === "WEEKLY" ? "tuần này" : "tất cả"}.
        </div>
      ) : (
        <div className="divide-y divide-line/70">
          {entries.map((entry) => {
            const isMe = entry.uid === currentUid;
            return (
              <article
                key={entry.uid}
                data-me={isMe ? "true" : undefined}
                className={`leaderboard-row grid grid-cols-[72px_1fr_120px_120px_96px] items-center gap-3 px-5 py-4 max-md:grid-cols-[56px_1fr_96px] transition-colors ${
                  isMe
                    ? "bg-primary/15 hover:bg-primary/20 border-l-4 border-l-primary shadow-inner"
                    : "bg-surface hover:bg-surface-soft/60"
                }`}
              >
                <RankBadge rank={entry.rank} />
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar name={entry.displayName ?? entry.email ?? "Người học"} avatarUrl={entry.avatarUrl} />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-extrabold text-ink flex items-center gap-2">
                      <span className="truncate">{entry.displayName ?? entry.email ?? "Người học"}</span>
                      {isMe ? (
                        <span className="shrink-0 rounded-full bg-primary text-gold-ink px-2 py-0.5 text-[10px] font-black tracking-wide shadow-sm">
                          Bạn
                        </span>
                      ) : null}
                    </h2>
                    <p className="mt-0.5 truncate text-xs font-medium text-ink3">
                      Bài làm {practiceLeaderboardLabel(entry.scope)} hợp lệ
                    </p>
                  </div>
                </div>
                <strong className="text-right text-lg font-black text-primary">
                  {scoreText(entry)}
                </strong>
                <span className="text-right text-sm font-bold text-ink max-md:hidden">
                  {entry.correctCount}/{entry.questionCount}
                </span>
                <span className="text-right text-sm font-medium text-ink3 max-md:hidden">
                  {formatElapsed(entry.elapsedMillis)}
                </span>
              </article>
            );
          })}
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
    <section className="leaderboard-board overflow-hidden rounded-[28px] border border-line bg-surface shadow-sm">
      <div className="grid grid-cols-[88px_1fr_112px] border-b border-line bg-surface-soft/80 px-5 py-3.5 text-xs font-extrabold uppercase tracking-wider text-ink3">
        <span>Hạng</span>
        <span>Người dùng</span>
        <span className="text-right">Chuỗi học</span>
      </div>

      {entries.length === 0 ? (
        <div className="p-12 text-center text-ink3">
          Chưa có dữ liệu chuỗi học. Hãy học một bài để xuất hiện trên bảng xếp hạng.
        </div>
      ) : (
        <div className="divide-y divide-line/70">
          {entries.map((entry) => {
            const isMe = entry.uid === currentUid;
            return (
              <article
                key={entry.uid}
                data-me={isMe ? "true" : undefined}
                className={`leaderboard-row grid grid-cols-[88px_1fr_112px] items-center px-5 py-4 transition-colors ${
                  isMe
                    ? "bg-primary/15 hover:bg-primary/20 border-l-4 border-l-primary shadow-inner"
                    : "bg-surface hover:bg-surface-soft/60"
                }`}
              >
                <RankBadge rank={entry.rank} />
                <div className="flex min-w-0 items-center gap-4">
                  <Avatar name={entry.displayName ?? entry.email ?? "Người học"} avatarUrl={entry.avatarUrl} />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-extrabold text-ink flex items-center gap-2">
                      <span className="truncate">{entry.displayName ?? entry.email ?? "Người học"}</span>
                      {isMe ? (
                        <span className="shrink-0 rounded-full bg-primary text-gold-ink px-2 py-0.5 text-[10px] font-black tracking-wide shadow-sm">
                          Bạn
                        </span>
                      ) : null}
                    </h2>
                    <p className="mt-0.5 text-xs font-medium">
                      {entry.studiedToday ? (
                        <span className="text-emerald-400 font-medium inline-flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                          Hôm nay đã học {entry.todayActivityCount} hoạt động
                        </span>
                      ) : (
                        <span className="text-ink3/80">Chưa học hôm nay</span>
                      )}
                    </p>
                  </div>
                </div>
                <strong className="text-right text-lg font-black text-orange-400 flex items-center justify-end gap-1.5">
                  <span>{entry.streakDays}</span>
                  <span aria-hidden="true">&#128293;</span>
                </strong>
              </article>
            );
          })}
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
      aria-current={active ? "page" : undefined}
      className={`leaderboard-tab ${compact ? "px-3.5 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-xl font-extrabold transition-all ${
        active
          ? "bg-primary text-gold-ink shadow-md shadow-primary/20 ring-1 ring-primary/40 font-black"
          : "border border-line bg-surface text-ink2 hover:bg-surface-soft hover:text-ink hover:border-line/90"
      }`}
    >
      {label}
    </Link>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-2xl drop-shadow-sm" aria-hidden="true">🥇</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/25 border border-amber-500/50 px-1 text-[11px] font-black text-amber-300">
          1
        </span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-2xl drop-shadow-sm" aria-hidden="true">🥈</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-300/25 border border-slate-300/50 px-1 text-[11px] font-black text-slate-200">
          2
        </span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-2xl drop-shadow-sm" aria-hidden="true">🥉</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-700/25 border border-amber-700/50 px-1 text-[11px] font-black text-amber-400">
          3
        </span>
      </div>
    );
  }

  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-soft border border-line text-sm font-extrabold text-ink2 shadow-inner">
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
        className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-line"
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "E";
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white text-base font-black shadow-sm ring-2 ring-line">
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
