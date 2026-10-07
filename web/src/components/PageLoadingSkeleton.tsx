import type { ReactNode } from "react";
import styles from "./PageLoadingSkeleton.module.css";

type Variant = "generic" | "hub" | "progress" | "leaderboard" | "community" | "account" | "continue" | "history";
const topbars: Partial<Record<Variant, [string, string]>> = {
  hub: ["Trang chủ", "Tổng quan học tập cá nhân"],
  progress: ["Báo cáo tiến bộ", "Dữ liệu từ các bài bạn đã nộp"],
  community: ["Community", "Discuss, contribute, and track leaderboard"],
  continue: ["Hoc tiep", "Resume drafts and review the next best activity"],
  history: ["Lịch sử làm bài", "Xem lại đáp án đã nộp"],
};

function Block({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`${styles.block} ${className}`} />;
}

function Topbar({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="app-shell-header flex items-center justify-between gap-4 border-b bg-glass/90 px-5 py-3 lg:px-8">
      <div className="min-w-0">
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted">Không gian học tập</p>
        <h1 className="truncate text-lg font-bold text-ink">{title}</h1>
        <p className="truncate text-sm text-muted">{subtitle}</p>
      </div>
      <div aria-hidden="true" className="flex shrink-0 items-center gap-2">
        <span className="hidden sm:block"><Block className="h-8 w-28" /></span>
        <Block className="h-8 w-24" />
      </div>
    </header>
  );
}

function Card({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div aria-hidden="true" className={`premium-card p-5 sm:p-6 ${className}`}>{children ?? <><Block className="h-4 w-28" /><Block className="mt-3 h-7 w-2/3" /><Block className="mt-3 h-4 w-full" /></>}</div>;
}

function MetricCards() {
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => (
    <div aria-hidden="true" key={index} className="premium-stat hub-stat p-4">
      <Block className="h-4 w-28" /><Block className="mt-2 h-8 w-20" /><Block className="mt-1 h-4 w-3/4" />
    </div>
  ))}</section>;
}

function Dashboard({ variant }: { variant: "hub" | "progress" }) {
  return <div className="mx-auto max-w-7xl space-y-6">
    <section aria-hidden="true" className={`premium-hero p-5 sm:p-7 ${variant === "hub" ? "hub-hero lg:p-8" : ""}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1"><Block className="h-4 w-32" /><Block className="mt-3 h-12 w-full max-w-lg" /><Block className="mt-2 h-5 w-full max-w-xl" /></div>
        <div className={`grid gap-3 ${variant === "hub" ? "grid-cols-2 sm:grid-cols-4 lg:min-w-[520px]" : "grid-cols-3 sm:min-w-[380px]"}`}>
          {Array.from({ length: variant === "hub" ? 4 : 3 }, (_, index) => <div key={index} className="premium-metric px-3 py-3"><Block className="h-3 w-16" /><Block className="mt-2 h-5 w-12" /></div>)}
        </div>
      </div>
    </section>
    {variant === "hub" && <MetricCards />}
    <section className={`grid gap-4 ${variant === "hub" ? "lg:grid-cols-[1.2fr_0.8fr]" : "lg:grid-cols-[1.35fr_0.65fr]"}`}>
      <Card className="min-h-72"><Block className="h-4 w-36" /><Block className="mt-2 h-6 w-56 max-w-full" />{variant === "hub" ? <div className="mt-5 grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Card key={index} className="!p-4"><Block className="h-4 w-2/3" /><Block className="mt-3 h-3 w-full" /><Block className="mt-3 h-2 w-full" /></Card>)}</div> : <Block className="mt-5 h-44 w-full" />}</Card>
      <Card className="min-h-72"><Block className="h-4 w-32" /><Block className="mt-3 h-7 w-4/5" /><Block className="mt-3 h-4 w-full" /><Block className="mt-2 h-4 w-5/6" /><Block className="mt-5 h-10 w-28" /></Card>
    </section>
    {variant === "hub" ? <Card><Block className="h-4 w-48 max-w-full" /><div className="mt-5 grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index} className="!p-4" />)}</div></Card> : <section className="grid gap-4 md:grid-cols-2"><Card className="min-h-52" /><Card className="min-h-52" /></section>}
  </div>;
}

function Board() {
  return <section className="leaderboard-shell mx-auto max-w-6xl space-y-5">
    <header className="leaderboard-summary flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-extrabold uppercase tracking-widest text-primary">Bảng xếp hạng</p><h1 className="mt-2 text-3xl font-extrabold text-ink">Bảng xếp hạng học tập TOEIC</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink3">Điểm nghe, đọc và đề thi chỉ tính bài làm hợp lệ; làm lại vẫn lưu lịch sử nhưng không cộng dồn vào bảng xếp hạng.</p></div>
      <Block className="h-12 w-36" />
    </header>
    <div aria-hidden="true" className="flex flex-wrap gap-2">{["Chuỗi học", "Nghe", "Đọc", "Đề thi", "Tuần này"].map(label => <span key={label} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-extrabold text-ink2">{label}</span>)}</div>
    <div aria-hidden="true" className="leaderboard-board overflow-hidden rounded-[28px] border border-line bg-surface">
      <div className={`${styles.boardRow} border-b border-line bg-surface-soft/80 !py-3.5 text-xs font-extrabold uppercase tracking-wider text-ink3`}><span>Hạng</span><span>Người dùng</span><span className="text-right">Chuỗi học</span></div>
      {Array.from({ length: 8 }, (_, index) => <div key={index} className={`${styles.boardRow} border-b border-line last:border-b-0`}><Block className="h-8 w-8" /><div className="flex min-w-0 items-center gap-4"><Block className="h-11 w-11 rounded-full" /><div className="min-w-0 flex-1"><Block className="h-4 w-2/3" /><Block className="mt-2 h-3 w-1/2" /></div></div><Block className="ml-auto h-5 w-12" /></div>)}
    </div>
  </section>;
}

function Account() {
  return <div className="mx-auto max-w-7xl">
    <header className="page-heading mb-8 border-b border-line pb-8"><span className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-extrabold uppercase text-primary">Tài khoản</span><h1 className="mt-4 text-5xl font-extrabold text-ink">Thông tin cá nhân</h1><p className="mt-3 text-lg text-muted">Chỉnh sửa tên hiển thị, ảnh đại diện và thông tin đăng nhập của bạn.</p></header>
    <section className="grid gap-6 lg:grid-cols-[290px_1fr]"><Card className="h-fit"><Block className="h-5 w-28" />{Array.from({ length: 3 }, (_, index) => <Block key={index} className="mt-4 h-12 w-full" />)}</Card><Card className="min-h-[480px] !p-6 sm:!p-8"><Block className="h-24 w-24 rounded-full" />{Array.from({ length: 3 }, (_, index) => <div key={index} className="mt-6"><Block className="h-4 w-28" /><Block className="mt-2 h-11 w-full" /></div>)}</Card></section>
  </div>;
}

export function HistoryLoadingRows() {
  return <div aria-hidden="true" className="overflow-hidden rounded-xl border border-line bg-surface"><div className="flex gap-4 border-b border-line bg-surface-soft p-3">{Array.from({ length: 6 }, (_, index) => <Block key={index} className="h-5 flex-1" />)}</div>{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-4 border-b border-line p-3 last:border-b-0"><div className="flex-[2]"><Block className="h-4 w-4/5" /><Block className="mt-2 h-3 w-2/3" /></div><Block className="h-5 flex-1" /><Block className="h-5 flex-1" /><Block className="hidden h-5 flex-1 sm:block" /><Block className="h-5 flex-1" /></div>)}</div>;
}

function Lists({ variant }: { variant: "community" | "continue" | "generic" }) {
  if (variant === "community") return <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-4"><Card className="min-h-64"><Block className="h-6 w-48 max-w-full" /><Block className="mt-3 h-4 w-3/4" /><Block className="mt-4 h-28 w-full" /><Block className="mt-3 h-9 w-28" /></Card>{Array.from({ length: 3 }, (_, index) => <Card key={index} />)}</div><div className="space-y-4"><Card className="min-h-80" /><Card /></div></section>;
  return <div className={`mx-auto space-y-6 ${variant === "continue" ? "max-w-5xl" : "max-w-7xl"}`}><section className="grid gap-4 md:grid-cols-2"><Card className="min-h-48" /><Card className="min-h-48" /></section><Card><Block className="h-6 w-48 max-w-full" />{Array.from({ length: 3 }, (_, index) => <Block key={index} className="mt-5 h-14 w-full" />)}</Card><Card className="min-h-48" /></div>;
}

/** Keep a real content footprint throughout an uncached server-data navigation. */
export default function PageLoadingSkeleton({ variant = "generic" }: { variant?: Variant }) {
  const topbar = topbars[variant];
  return <>
    {topbar && <Topbar title={topbar[0]} subtitle={topbar[1]} />}
    <main aria-busy="true" className={`${styles.page} app-canvas flex-1 overflow-y-auto ${variant === "leaderboard" ? "leaderboard-page px-5 py-8 lg:px-8" : variant === "account" ? "account-page px-5 py-8 sm:py-12" : "px-4 py-6 lg:px-8"}`}>
      <p role="status" className="sr-only">Đang tải dữ liệu…</p>
      {variant === "hub" || variant === "progress" ? <Dashboard variant={variant} /> : variant === "leaderboard" ? <Board /> : variant === "account" ? <Account /> : variant === "history" ? <HistoryLoadingRows /> : <Lists variant={variant} />}
    </main>
  </>;
}
