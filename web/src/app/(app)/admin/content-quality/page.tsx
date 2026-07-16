import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { getContentQualityDashboard, type ContentQualityQuestion } from "@/lib/services/content-quality";

export const dynamic = "force-dynamic";

export default async function ContentQualityPage() {
  const user = await requireAdminPage();
  const dashboard = await getContentQualityDashboard();
  const { summary } = dashboard;

  return (
    <>
      <AppTopbar pageTitle="Chất lượng nội dung" pageSubtitle="Tín hiệu tổng hợp từ bài đã nộp và báo lỗi của học viên" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Bài đã tổng hợp" value={summary.attempts} />
            <Metric label="Câu đã chấm" value={summary.questions} />
            <Metric label="Độ đúng chung" value={summary.accuracy == null ? "—" : `${summary.accuracy}%`} />
            <Metric label="Thời gian / câu" value={summary.averageSecondsPerQuestion == null ? "—" : `${summary.averageSecondsPerQuestion}s`} />
            <Metric label="Báo lỗi nhận được" value={summary.reports} />
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-terracotta">Cần rà soát</p>
                <h1 className="mt-1 text-2xl font-extrabold text-ink">Câu có tín hiệu bất thường</h1>
              </div>
              <p className="max-w-xl text-xs leading-relaxed text-muted">Điểm rủi ro kết hợp tỉ lệ sai, số lượt làm và báo lỗi. Nó là tín hiệu để review nội dung, không tự kết luận một câu hỏi sai.</p>
            </div>
            <QuestionTable items={dashboard.highRiskQuestions} empty="Chưa có dữ liệu đủ lớn (cần tối thiểu 3 lượt làm cho mỗi câu)." />
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Phản hồi học viên</p>
                <h2 className="mt-1 text-2xl font-extrabold text-ink">Câu được báo lỗi nhiều nhất</h2>
              </div>
              <Link href="/admin/content-review" className="text-sm font-extrabold text-primary hover:underline">Mở hàng đợi nội dung</Link>
            </div>
            <QuestionTable items={dashboard.reportedQuestions} empty="Chưa có báo lỗi nào từ học viên." />
          </section>
        </div>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs font-bold text-muted">{label}</p><strong className="mt-2 block text-2xl font-extrabold text-ink">{value}</strong></article>;
}

function QuestionTable({ items, empty }: { items: ContentQualityQuestion[]; empty: string }) {
  if (items.length === 0) return <p className="mt-5 rounded-xl bg-surface-soft p-5 text-sm text-muted">{empty}</p>;
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-surface-soft text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Câu hỏi</th><th className="px-4 py-3">Dạng</th><th className="px-4 py-3">Lượt làm</th><th className="px-4 py-3">Độ đúng</th><th className="px-4 py-3">Thời gian</th><th className="px-4 py-3">Báo lỗi</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} className="border-t border-line"><td className="px-4 py-3 font-extrabold text-ink">Test {item.testId} · Câu {item.questionId}<span className="ml-2 rounded-full bg-surface-soft px-2 py-0.5 text-xs text-muted">Part {item.part}</span></td><td className="px-4 py-3 text-muted">{item.weakTag}</td><td className="px-4 py-3 text-ink">{item.attempts}</td><td className="px-4 py-3"><span className={item.accuracy < 50 ? "font-extrabold text-terracotta" : "text-ink"}>{item.accuracy}%</span></td><td className="px-4 py-3 text-muted">{item.averageSeconds}s</td><td className="px-4 py-3"><span className={item.reports > 0 ? "font-extrabold text-primary" : "text-muted"}>{item.reports}</span></td></tr>)}</tbody>
      </table>
    </div>
  );
}
