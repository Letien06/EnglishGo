import Link from "next/link";
import type { CSSProperties } from "react";
import NavIcon from "@/components/NavIcon";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getHub } from "@/lib/services/hub";
import HubReadySignal from "./HubReadySignal";

export default async function HubPage() {
  const user = await requireUser();
  const hub = await getHub(user);
  const totalActivities = Object.values(hub.moduleTotals).reduce((sum, value) => sum + value, 0);
  const moduleRows = [
    {
      key: "listening",
      label: "Nghe",
      href: "/listen",
      today: hub.todayListening,
      total: hub.moduleTotals.listening,
      tone: "text-plum",
      bg: "bg-plum/10",
    },
    {
      key: "reading",
      label: "Đọc",
      href: "/read",
      today: hub.todayReading,
      total: hub.moduleTotals.reading,
      tone: "text-azure",
      bg: "bg-azure/10",
    },
    {
      key: "vocab",
      label: "Từ vựng",
      href: "/vocab",
      today: hub.todayVocab,
      total: hub.moduleTotals.vocab,
      tone: "text-jade",
      bg: "bg-jade/10",
    },
    {
      key: "practice",
      label: "Đề thi",
      href: "/practice",
      today: hub.todayPractice,
      total: hub.moduleTotals.practice,
      tone: "text-terracotta",
      bg: "bg-terracotta/10",
    },
  ] as const;
  const primaryRecommendation = hub.nextRecommendation ?? {
    label: "Tiếp tục lộ trình học",
    href: "/continue",
    reason: "Mở danh sách việc nên làm tiếp dựa trên tiến độ hiện tại.",
  };

  return (
    <>
      <HubReadySignal />
      <AppTopbar
        pageTitle="Trang chủ"
        pageSubtitle="Tổng quan học tập cá nhân"
        userName={user.displayName}
        userEmail={user.email}
      />

      <main className="app-canvas hub-page flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <section className="premium-hero premium-reveal hub-hero p-5 sm:p-7 lg:p-8">
            <div className="premium-hero-orbit" aria-hidden="true" />
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
                  ENGLISHGO
                </p>
                <h1 className="mt-2 max-w-2xl text-3xl font-extrabold text-ink sm:text-4xl lg:text-5xl">
                  {hub.greetingName}, hôm nay học gì?
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  Lộ trình, điểm luyện tập và tiến độ kỹ năng được cập nhật từ hoạt động học của bạn.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
                <MiniMetric label="XP hôm nay" value={hub.todayXp} />
                <MiniMetric label="Chuỗi ngày" value={hub.streakDays} />
                <MiniMetric label="Mục tiêu TOEIC" value={hub.targetScore ?? "Chưa đặt"} />
                <MiniMetric label="Trình độ" value={hub.level ?? "Chưa đặt"} />
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số học tập">
            <StatCard
              label="Hoạt động hôm nay"
              value={hub.dailyGoalCompleted}
              sub={`Tổng XP: ${hub.totalXp}`}
              tone="text-primary"
            />
            <StatCard
              label="Lần học gần nhất"
              value={formatLastActivity(hub.lastActivityAtMillis)}
              sub={hub.dailyGoalCompleted > 0 ? "Đã có hoạt động trong ngày" : "Chưa học hôm nay"}
              tone="text-celadon"
            />
            <StatCard
              label="Từ đã thuộc"
              value={hub.masteredWords}
              sub={hub.dueVocabWords > 0 ? `${hub.dueVocabWords} từ cần ôn` : "Không có từ đến hạn"}
              tone="text-jade"
            />
            <StatCard
              label="Bài thi đã nộp"
              value={hub.completedTests}
              sub={`Điểm trung bình: ${hub.averageScore}`}
              tone="text-terracotta"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="premium-card hub-activity-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
                    Hoạt động hôm nay
                  </p>
                  <h2 className="mt-1 text-lg font-extrabold text-ink">
                    {hub.dailyGoalCompleted} hoạt động đã ghi nhận
                  </h2>
                </div>
                <Link
                  href="/continue"
                  className="premium-primary inline-flex gap-1.5 px-4 py-2 text-sm"
                >
                  Học tiếp
                  <NavIcon name="arrow-right" className="h-4 w-4" />
                </Link>
              </div>

              {hub.dailyGoalCompleted === 0 ? (
                <div className="app-empty-state mt-5">
                  <span className="app-empty-state-mark" aria-hidden="true">15</span>
                  <div>
                    <h2 className="text-base font-extrabold text-ink">Bắt đầu nhẹ nhàng trong 15 phút</h2>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Hoàn thành một hoạt động hôm nay để duy trì nhịp học và mở khóa gợi ý chính xác hơn.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {moduleRows.map((item) => {
                  const share = sharePercent(item.today, hub.dailyGoalCompleted);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="premium-card premium-card--interactive hub-module-card rounded-2xl p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-extrabold text-ink">{item.label}</h3>
                          <p className="mt-1 text-xs text-muted">
                            Hôm nay: {item.today} · Tổng: {item.total}
                          </p>
                        </div>
                        <strong className={`text-lg ${item.tone}`}>{share}%</strong>
                      </div>
                      <div className="progress-bar mt-3">
                        <span style={{ "--progress": share / 100 } as CSSProperties} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </article>

            <article className="premium-card hub-recommendation p-5 sm:p-6">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
                Gợi ý tiếp theo
              </p>
              <h2 className="mt-2 text-xl font-extrabold text-ink">
                {primaryRecommendation.label}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {primaryRecommendation.reason}
              </p>
              <Link
                href={primaryRecommendation.href}
                className="premium-primary mt-5 inline-flex gap-1.5 px-4 py-2 text-sm"
              >
                Mở ngay
                <NavIcon name="arrow-right" className="h-4 w-4" />
              </Link>

              {hub.dueVocabWords > 0 ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">
                    Ôn tập SRS
                  </p>
                  <p className="mt-1 text-sm font-bold text-ink">
                    {hub.dueVocabWords} từ vựng đang đến hạn.
                  </p>
                  <Link
                    href="/vocab?tab=progress"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-extrabold text-primary hover:underline"
                  >
                    <NavIcon name="vocab" className="h-4 w-4" />
                    Ôn từ vựng
                  </Link>
                </div>
              ) : null}
            </article>
          </section>

          <section className="premium-card hub-overview p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
                  Tổng hoạt động theo kỹ năng
                </p>
                <h2 className="mt-1 text-lg font-extrabold text-ink">
                  {totalActivities} hoạt động đã lưu
                </h2>
              </div>
              <Link href="/leaderboard" className="inline-flex items-center gap-1 text-sm font-extrabold text-primary hover:underline">
                <NavIcon name="leaderboard" className="h-4 w-4" />
                Xem bảng xếp hạng
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {moduleRows.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`premium-card premium-card--interactive hub-overview-card ${item.bg} p-4`}
                >
                  <span className={`text-xs font-extrabold uppercase tracking-widest ${item.tone}`}>
                    {item.label}
                  </span>
                  <strong className="mt-2 block text-2xl font-extrabold text-ink">
                    {item.total}
                  </strong>
                  <small className="mt-1 block text-muted">
                    {item.today} hoạt động hôm nay
                  </small>
                </Link>
              ))}
            </div>
          </section>

          <section className="premium-card p-5 sm:p-6" aria-label="Lộ trình học hôm nay">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Lộ trình hôm nay</p>
                <h2 className="mt-1 text-lg font-extrabold text-ink">Ba bước nhỏ, một hướng đi rõ ràng</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">Theo tiến độ của bạn</span>
            </div>
            <ol className="mt-5 grid gap-3 md:grid-cols-3">
              <PlanStep number="01" title={primaryRecommendation.label} detail={primaryRecommendation.reason} href={primaryRecommendation.href} action="Bắt đầu" />
              <PlanStep number="02" title="Ghi nhận điểm yếu" detail="Sau mỗi bài luyện, xem lại câu sai để chọn kỹ năng cần cải thiện." href="/practice/history" action="Xem lịch sử" />
              <PlanStep number="03" title="Khép lại bằng ôn tập" detail={hub.dueVocabWords > 0 ? "Có từ vựng đến hạn đang chờ bạn." : "Ôn một nhóm từ để củng cố trí nhớ."} href="/vocab?tab=progress" action="Ôn từ" />
            </ol>
          </section>
        </div>
      </main>
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="premium-metric px-3 py-3">
      <small className="block truncate text-[11px] font-bold text-muted">{label}</small>
      <strong className="mt-1 block truncate text-base font-extrabold text-ink">
        {value}
      </strong>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  tone: string;
}) {
  return (
    <article className="premium-stat hub-stat p-4">
      <small className="text-xs font-bold text-muted">{label}</small>
      <strong className={`mt-2 block text-2xl font-extrabold ${tone}`}>
        {value}
      </strong>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </article>
  );
}

function PlanStep({ number, title, detail, href, action }: { number: string; title: string; detail: string; href: string; action: string }) {
  return (
    <li className="app-empty-state">
      <span className="app-empty-state-mark" aria-hidden="true">{number}</span>
      <div className="min-w-0">
        <h3 className="text-sm font-extrabold text-ink">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
        <Link href={href} className="mt-3 inline-flex text-xs font-extrabold text-primary hover:underline">{action} →</Link>
      </div>
    </li>
  );
}

function sharePercent(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0;
  return Math.min(100, Math.round((value * 100) / total));
}

function formatLastActivity(value: number | null): string {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}
