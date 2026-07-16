import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import {
  getProgressReport,
  type ProgressPartSummary,
  type ProgressSkillSummary,
  type ProgressTrendPoint,
} from "@/lib/services/progress-report";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const user = await requireUser();
  const report = await getProgressReport(user.uid);

  return (
    <>
      <AppTopbar
        pageTitle="Báo cáo tiến bộ"
        pageSubtitle="Dữ liệu từ các bài bạn đã nộp"
        userName={user.displayName}
        userEmail={user.email}
      />
      <main className="app-canvas flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="premium-hero p-5 sm:p-7">
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Học theo dữ liệu</p>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-extrabold text-ink sm:text-4xl">Tiến bộ TOEIC của bạn</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  Báo cáo dùng kết quả chấm trên server. Điểm TOEIC chỉ là ước tính, không thay thế kết quả thi chính thức.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:min-w-[380px]">
                <Metric label="Bài đã phân tích" value={report.totalAttempts} />
                <Metric label="Câu đã làm" value={report.totalQuestions} />
                <Metric label="Chính xác" value={report.overallAccuracy == null ? "—" : `${report.overallAccuracy}%`} />
              </div>
            </div>
          </section>

          {report.totalAttempts === 0 ? (
            <section className="premium-card p-8 text-center">
              <h2 className="text-xl font-extrabold text-ink">Chưa đủ dữ liệu để tạo báo cáo</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                Hãy nộp bài luyện đầu tiên. Sau đó bạn sẽ thấy xu hướng điểm, phần mạnh/yếu và dự báo minh bạch theo dữ liệu của chính mình.
              </p>
              <Link href="/practice" className="premium-primary mt-5 inline-flex px-4 py-2 text-sm">
                Làm bài ngay
              </Link>
            </section>
          ) : (
            <>
              <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                <article className="premium-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Xu hướng kết quả</p>
                      <h2 className="mt-1 text-xl font-extrabold text-ink">Độ chính xác theo lần làm</h2>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">20 bài gần nhất</span>
                  </div>
                  <AccuracyChart points={report.trend} />
                </article>
                <ForecastCard forecast={report.forecast} />
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <SkillCard summary={report.listening} title="Listening" tone="plum" />
                <SkillCard summary={report.reading} title="Reading" tone="azure" />
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <PartGroup title="Điểm mạnh hiện tại" description="Ưu tiên duy trì bằng bài luyện ngắn và ôn lỗi cũ." parts={report.strongestParts} tone="jade" />
                <PartGroup title="Điểm cần tập trung" description="Chọn một phần thấp nhất làm mục tiêu cho phiên học kế tiếp." parts={report.weakestParts} tone="terracotta" />
              </section>

              <section className="premium-card p-5 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Theo từng phần TOEIC</p>
                    <h2 className="mt-1 text-xl font-extrabold text-ink">Nơi nên đầu tư thời gian</h2>
                  </div>
                  <Link href="/practice/history" className="text-sm font-extrabold text-primary hover:underline">Xem lịch sử bài làm</Link>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {report.parts.map((part) => <PartCard key={part.part} part={part} />)}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="premium-metric px-3 py-3"><small className="block text-[11px] font-bold text-muted">{label}</small><strong className="mt-1 block text-lg font-extrabold text-ink">{value}</strong></div>;
}

function AccuracyChart({ points }: { points: ProgressTrendPoint[] }) {
  if (points.length < 2) {
    return <p className="mt-8 rounded-xl bg-surface-soft p-6 text-sm text-muted">Cần ít nhất hai bài đã nộp để hiển thị đường xu hướng.</p>;
  }
  const width = 720;
  const height = 250;
  const padding = { top: 18, right: 18, bottom: 35, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const coordinates = points.map((point, index) => ({
    x: padding.left + (index * plotWidth) / Math.max(points.length - 1, 1),
    y: padding.top + (1 - point.accuracy / 100) * plotHeight,
    point,
  }));
  const polyline = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const labels = [0, 25, 50, 75, 100];

  return (
    <div className="mt-5 overflow-x-auto">
      <svg className="min-w-[560px] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ độ chính xác theo các bài đã nộp">
        {labels.map((value) => {
          const y = padding.top + (1 - value / 100) * plotHeight;
          return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" /><text x={padding.left - 9} y={y + 4} textAnchor="end" className="fill-muted text-[11px]">{value}%</text></g>;
        })}
        <polyline fill="none" points={polyline} stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
        {coordinates.map(({ x, y, point }) => <g key={point.attemptId}><circle cx={x} cy={y} r="5" className="fill-surface stroke-primary" strokeWidth="3"><title>{`${formatDate(point.submittedAtMillis)}: ${point.accuracy}%`}</title></circle></g>)}
        {coordinates.filter((_, index) => index === 0 || index === coordinates.length - 1 || index % Math.ceil(coordinates.length / 4) === 0).map(({ x, point }) => <text key={`${point.attemptId}-label`} x={x} y={height - 10} textAnchor="middle" className="fill-muted text-[11px]">{formatShortDate(point.submittedAtMillis)}</text>)}
      </svg>
      <p className="mt-2 text-xs text-muted">Mỗi điểm là tỷ lệ đúng của một bài đã nộp; các bài có độ dài khác nhau vẫn được hiển thị rõ theo phần trăm.</p>
    </div>
  );
}

function ForecastCard({ forecast }: { forecast: Awaited<ReturnType<typeof getProgressReport>>["forecast"] }) {
  return (
    <article className="premium-card p-5 sm:p-6">
      <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Dự báo 4 tuần</p>
      {forecast.available ? (
        <>
          <h2 className="mt-2 text-xl font-extrabold text-ink">~{forecast.predictedScore} TOEIC</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Khoảng tham khảo: ~{forecast.lowerBound}–{forecast.upperBound}. Hiện tại: ~{forecast.currentScore}.</p>
          <p className="mt-4 rounded-xl bg-surface-soft p-3 text-xs leading-relaxed text-muted">Dự báo dùng xu hướng của {forecast.sampleSize} bài có đủ Listening và Reading. Nó không phải cam kết điểm thi.</p>
        </>
      ) : (
        <>
          <h2 className="mt-2 text-xl font-extrabold text-ink">Chưa dự báo</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">Cần tối thiểu 3 bài có đủ Listening và Reading để ước tính một khoảng điểm có trách nhiệm.</p>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Hiện có {forecast.sampleSize}/3 bài phù hợp. Bài luyện từng phần vẫn được dùng trong phân tích mạnh/yếu.</p>
        </>
      )}
    </article>
  );
}

function SkillCard({ summary, title, tone }: { summary: ProgressSkillSummary; title: string; tone: "plum" | "azure" }) {
  const colors = tone === "plum" ? "bg-plum/10 text-plum" : "bg-azure/10 text-azure";
  return <article className="premium-card p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-muted">{title}</p><h2 className="mt-1 text-2xl font-extrabold text-ink">{summary.accuracy == null ? "Chưa có dữ liệu" : `${summary.accuracy}% chính xác`}</h2></div><span className={`rounded-xl px-3 py-2 text-sm font-extrabold ${colors}`}>{summary.latestEstimatedScore == null ? "—" : `~${summary.latestEstimatedScore}/495`}</span></div><p className="mt-4 text-sm text-muted">{summary.total > 0 ? `${summary.correct}/${summary.total} câu đúng đã được chấm.` : "Hãy nộp bài có phần này để bắt đầu theo dõi."}</p></article>;
}

function PartGroup({ title, description, parts, tone }: { title: string; description: string; parts: ProgressPartSummary[]; tone: "jade" | "terracotta" }) {
  const color = tone === "jade" ? "text-jade" : "text-terracotta";
  return <article className="premium-card p-5 sm:p-6"><p className={`text-xs font-extrabold uppercase tracking-widest ${color}`}>{title}</p><p className="mt-2 text-sm text-muted">{description}</p><div className="mt-5 space-y-3">{parts.length > 0 ? parts.map((part) => <div key={part.part} className="flex items-center justify-between rounded-xl bg-surface-soft px-4 py-3"><span className="font-extrabold text-ink">Part {part.part}</span><span className={`text-sm font-extrabold ${color}`}>{part.accuracy}%</span></div>) : <p className="text-sm text-muted">Chưa có đủ dữ liệu theo phần.</p>}</div></article>;
}

function PartCard({ part }: { part: ProgressPartSummary }) {
  return <article className="rounded-2xl border border-line bg-surface-soft/60 p-4"><div className="flex items-center justify-between"><strong className="text-ink">Part {part.part}</strong><span className={`text-xs font-extrabold ${part.skill === "LISTENING" ? "text-plum" : "text-azure"}`}>{part.skill === "LISTENING" ? "Listening" : "Reading"}</span></div><p className="mt-3 text-2xl font-extrabold text-ink">{part.accuracy}%</p><p className="mt-1 text-xs text-muted">{part.correct}/{part.total} câu đúng</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><span className={`block h-full rounded-full ${part.skill === "LISTENING" ? "bg-plum" : "bg-azure"}`} style={{ width: `${part.accuracy}%` }} /></div></article>;
}

function formatShortDate(value: number) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}
