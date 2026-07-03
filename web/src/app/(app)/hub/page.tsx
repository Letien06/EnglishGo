import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getHub } from "@/lib/services/hub";

const skillTabs = [
  { label: "Tổng quan", icon: "▦", href: null, active: true },
  { label: "Đọc", icon: "▥", href: "/read", active: false },
  { label: "Nghe", icon: "♫", href: "/listen", active: false },
  { label: "Từ vựng", icon: "A", href: "/vocab", active: false },
];

const dailyGoals = [
  { label: "Đọc", icon: "▥", target: 30, unit: "câu", color: "text-celadon" },
  { label: "Nghe", icon: "♫", target: 30, unit: "câu", color: "text-plum" },
  { label: "Từ vựng", icon: "A", target: 20, unit: "từ", color: "text-jade" },
  { label: "Luyện đề", icon: "?", target: 40, unit: "câu", color: "text-terracotta" },
  { label: "Video", icon: "▷", target: 2, unit: "bài", color: "text-crimson" },
];

export default async function HubPage() {
  const user = await requireUser();
  const hub = await getHub(user);

  return (
    <>
      <AppTopbar
        pageTitle="Dashboard"
        pageSubtitle="Track your progress"
        userName={user.displayName}
        userEmail={user.email}
      />

      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-8">
        {/* ── HERO ── */}
        <section className="flex items-center justify-between gap-4 p-6 rounded-2xl bg-surface border border-line">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              🚀 ENGLISHGO CÙNG BẠN
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-ink mt-1">
              {hub.greetingName}, luyện tiếp thôi!
            </h1>
            <p className="text-sm text-muted mt-1">
              Mỗi ngày một chút, điểm số sẽ tự nói lên sự nỗ lực của bạn.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-3xl" aria-hidden="true">
            <span>♨</span>
            <span className="text-primary">↗</span>
            <span>♕</span>
          </div>
        </section>

        {/* ── STAT GRID ── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Thống kê học tập">
          <StatCard icon="◷" label="Thời gian học" value="0m" color="text-azure" />
          <StatCard
            icon="♨"
            label="Chuỗi ngày"
            value={String(hub.streakDays)}
            sub={`Dài nhất: ${hub.streakDays} ngày`}
            color="text-terracotta"
          />
          <StatCard
            icon="◎"
            label="XP hôm nay"
            value="0"
            sub={`Trọn đời: ${hub.completedTests * 5}`}
            color="text-celadon"
          />
          <StatCard icon="♕" label="Gói hiện tại" value="Miễn phí" color="text-gold" />
        </section>

        {/* ── SKILLS ── */}
        <section aria-label="Kỹ năng">
          <strong className="text-xs uppercase tracking-widest text-muted">
            KỸ NĂNG
          </strong>
          <div className="flex flex-wrap gap-2 mt-3">
            {skillTabs.map((tab) =>
              tab.href ? (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-ink2 hover:text-ink hover:bg-surface-soft transition-colors"
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.label}
                </Link>
              ) : (
                <button
                  key={tab.label}
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab.active
                      ? "bg-primary-soft text-primary"
                      : "text-ink2 hover:text-ink hover:bg-surface-soft"
                  }`}
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.label}
                </button>
              ),
            )}
          </div>
        </section>

        {/* ── SKILL SUMMARIES ── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Tổng quan kỹ năng">
          <SkillSummary
            icon="?"
            title="Luyện đề"
            value={`${hub.completedTests} câu đã làm`}
            note="Hôm nay · Chưa luyện trong khoảng này"
            color="bg-plum/10 text-plum"
          />
          <SkillSummary
            icon="▥"
            title="Đọc"
            value="0 câu đã làm"
            note="Hôm nay · Chưa luyện trong khoảng này"
            color="bg-jade/10 text-jade"
          />
          <SkillSummary
            icon="♫"
            title="Nghe"
            value="0 câu đã nghe"
            note="Hôm nay · Chưa luyện trong khoảng này"
            color="bg-plum/10 text-plum2"
          />
        </section>

        {/* ── DAILY GOALS ── */}
        <section>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-soft text-primary text-xs font-semibold mb-4">
            ◎ Mục tiêu hôm nay
          </span>

          {/* Total progress */}
          <article className="flex items-center gap-4 p-5 rounded-2xl bg-surface border border-line mb-4">
            <span className="text-2xl">♕</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <strong className="text-sm font-bold text-ink">Tiến độ tổng</strong>
                <span className="text-sm text-muted">
                  <b className="text-ink">{hub.dailyGoalCompleted}</b> /{" "}
                  {hub.dailyGoalTarget * 5}{" "}
                  <em className="text-primary">{hub.dailyGoalPercent}%</em>
                </span>
              </div>
              <div className="progress-bar">
                <span style={{ width: `${hub.dailyGoalPercent}%` }} />
              </div>
            </div>
          </article>

          {/* Goal rows */}
          <div className="flex flex-col gap-2">
            {dailyGoals.map((goal) => (
              <article
                key={goal.label}
                className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-line"
              >
                <span className={`text-lg ${goal.color}`}>{goal.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-ink">{goal.label}</h3>
                  <strong className="text-xs text-muted">
                    0 <small>/ {goal.target} {goal.unit}</small>
                  </strong>
                  <div className="progress-bar mt-1.5">
                    <span style={{ width: "0%" }} />
                  </div>
                </div>
                <b className="text-sm text-muted shrink-0">0%</b>
              </article>
            ))}
          </div>

          {/* Goal settings link */}
          <Link
            href="/account"
            className="flex items-center gap-4 p-4 rounded-xl bg-surface-soft border border-line mt-4 hover:border-primary/30 transition-colors"
          >
            <span className="text-lg">⚙</span>
            <div className="flex-1 min-w-0">
              <strong className="text-sm font-semibold text-ink block">
                Cài đặt mục tiêu hằng ngày
              </strong>
              <small className="text-xs text-muted">
                Tùy chỉnh số câu, từ, bài bạn muốn hoàn thành mỗi ngày
              </small>
            </div>
            <b className="text-lg text-muted">→</b>
          </Link>
        </section>
      </main>
    </>
  );
}

/* ── Helper components ── */

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <article className="flex items-start gap-3 p-4 rounded-xl bg-surface border border-line">
      <span className={`text-xl ${color}`}>{icon}</span>
      <div className="min-w-0">
        <small className="text-[11px] text-muted block">{label}</small>
        <strong className="text-lg font-bold text-ink">{value}</strong>
        {sub && <em className="text-[11px] text-muted block">{sub}</em>}
      </div>
    </article>
  );
}

function SkillSummary({
  icon,
  title,
  value,
  note,
  color,
}: {
  icon: string;
  title: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <article className={`p-5 rounded-2xl border border-line ${color}`}>
      <span className="text-2xl block mb-2">{icon}</span>
      <h2 className="text-base font-bold mb-1">{title}</h2>
      <strong className="text-sm block">{value}</strong>
      <p className="text-xs opacity-70 mt-1">{note}</p>
    </article>
  );
}
