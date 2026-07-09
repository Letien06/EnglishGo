import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getHub } from "@/lib/services/hub";

const skillTabs = [
  { label: "Tong quan", icon: "D", href: null, active: true },
  { label: "Doc", icon: "R", href: "/read", active: false },
  { label: "Nghe", icon: "L", href: "/listen", active: false },
  { label: "Tu vung", icon: "V", href: "/vocab", active: false },
] as const;

const dailyGoals = [
  { key: "reading", label: "Doc", icon: "R", target: 2, unit: "hoat dong", color: "text-celadon" },
  { key: "listening", label: "Nghe", icon: "L", target: 2, unit: "hoat dong", color: "text-plum" },
  { key: "vocab", label: "Tu vung", icon: "V", target: 4, unit: "hoat dong", color: "text-jade" },
  { key: "practice", label: "Luyen de", icon: "P", target: 2, unit: "hoat dong", color: "text-terracotta" },
] as const;

export default async function HubPage() {
  const user = await requireUser();
  const hub = await getHub(user);
  const todayByModule = {
    reading: hub.todayReading,
    listening: hub.todayListening,
    vocab: hub.todayVocab,
    practice: hub.todayPractice,
  };

  return (
    <>
      <AppTopbar
        pageTitle="Dashboard"
        pageSubtitle="Track your progress"
        userName={user.displayName}
        userEmail={user.email}
      />

      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-8">
        <section className="flex items-center justify-between gap-4 p-6 rounded-2xl bg-surface border border-line">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              ENGLISHGO CUNG BAN
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-ink mt-1">
              {hub.greetingName}, luyen tiep thoi!
            </h1>
            <p className="text-sm text-muted mt-1">
              Moi ngay mot chut, diem so se tu noi len tien do cua ban.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-3xl" aria-hidden="true">
            <span>XP</span>
            <span className="text-primary">{hub.todayXp}</span>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Thong ke hoc tap">
          <StatCard icon="T" label="Thoi gian hoc" value={`${hub.dailyGoalCompleted * 5}m`} color="text-azure" />
          <StatCard
            icon="S"
            label="Chuoi ngay"
            value={String(hub.streakDays)}
            sub={`Hom nay: ${hub.dailyGoalCompleted} hoat dong`}
            color="text-terracotta"
          />
          <StatCard
            icon="XP"
            label="XP hom nay"
            value={String(hub.todayXp)}
            sub={`Tong XP: ${hub.totalXp}`}
            color="text-celadon"
          />
          <StatCard icon="V" label="Tu da thuoc" value={String(hub.masteredWords)} color="text-gold" />
        </section>

        {hub.dueVocabWords > 0 ? (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">
                Can on hom nay
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-ink">
                {hub.dueVocabWords} tu vung dang den han SRS
              </h2>
              <p className="mt-1 text-sm text-muted">On ngay de giu chuoi nho dai han.</p>
            </div>
            <Link
              href="/vocab?tab=progress"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-extrabold text-white"
            >
              On tu
            </Link>
          </section>
        ) : null}

        {hub.nextRecommendation ? (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary-soft p-5">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                Goi y hoc tiep
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-ink">
                {hub.nextRecommendation.label}
              </h2>
              <p className="mt-1 text-sm text-muted">{hub.nextRecommendation.reason}</p>
            </div>
            <Link
              href={hub.nextRecommendation.href}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-gold-ink"
            >
              Hoc tiep
            </Link>
          </section>
        ) : null}

        <section aria-label="Ky nang">
          <strong className="text-xs uppercase tracking-widest text-muted">
            KY NANG
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

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Tong quan ky nang">
          <SkillSummary
            icon="P"
            title="Luyen de"
            value={`${hub.todayPractice} hoat dong hom nay`}
            note={`${hub.completedTests} lan nop bai - diem TB ${hub.averageScore}`}
            color="bg-plum/10 text-plum"
          />
          <SkillSummary
            icon="R"
            title="Doc"
            value={`${hub.todayReading} hoat dong hom nay`}
            note={hub.todayReading > 0 ? "Da co tien do trong ngay" : "Chua luyen doc hom nay"}
            color="bg-jade/10 text-jade"
          />
          <SkillSummary
            icon="L"
            title="Nghe"
            value={`${hub.todayListening} hoat dong hom nay`}
            note={hub.todayListening > 0 ? "Da co tien do trong ngay" : "Chua luyen nghe hom nay"}
            color="bg-plum/10 text-plum2"
          />
        </section>

        <section>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-soft text-primary text-xs font-semibold mb-4">
            Muc tieu hom nay
          </span>

          <article className="flex items-center gap-4 p-5 rounded-2xl bg-surface border border-line mb-4">
            <span className="text-2xl">T</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <strong className="text-sm font-bold text-ink">Tien do tong</strong>
                <span className="text-sm text-muted">
                  <b className="text-ink">{hub.dailyGoalCompleted}</b> /{" "}
                  {hub.dailyGoalTarget}{" "}
                  <em className="text-primary">{hub.dailyGoalPercent}%</em>
                </span>
              </div>
              <div className="progress-bar">
                <span style={{ width: `${hub.dailyGoalPercent}%` }} />
              </div>
            </div>
          </article>

          <div className="flex flex-col gap-2">
            {dailyGoals.map((goal) => {
              const current = todayByModule[goal.key];
              const percent = Math.min(100, Math.round((current * 100) / goal.target));
              return (
                <article
                  key={goal.label}
                  className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-line"
                >
                  <span className={`text-lg ${goal.color}`}>{goal.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-ink">{goal.label}</h3>
                    <strong className="text-xs text-muted">
                      {current} <small>/ {goal.target} {goal.unit}</small>
                    </strong>
                    <div className="progress-bar mt-1.5">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <b className="text-sm text-muted shrink-0">{percent}%</b>
                </article>
              );
            })}
          </div>

          <Link
            href="/account"
            className="flex items-center gap-4 p-4 rounded-xl bg-surface-soft border border-line mt-4 hover:border-primary/30 transition-colors"
          >
            <span className="text-lg">G</span>
            <div className="flex-1 min-w-0">
              <strong className="text-sm font-semibold text-ink block">
                Cai dat muc tieu hang ngay
              </strong>
              <small className="text-xs text-muted">
                Sau nay co the tuy chinh so hoat dong, tu vung va bai luyen theo tung ky nang.
              </small>
            </div>
            <b className="text-lg text-muted">-&gt;</b>
          </Link>
        </section>
      </main>
    </>
  );
}

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
