import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import SelectionDictionary from "@/components/SelectionDictionary";
import { requireUserForRead } from "@/lib/auth/session";
import { recentJobs, type AiWritingJob } from "@/lib/services/ai-writing";
import AiWritingForm from "./AiWritingForm";

export const dynamic = "force-dynamic";

export default async function AiWritingPage() {
  const user = await requireUserForRead();
  const jobs = await recentJobs(user.uid);

  return (
    <>
      <AppTopbar pageTitle="Phản hồi bài viết với AI" pageSubtitle="Nhận góp ý nhanh để cải thiện bài viết" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-3.5">
          <div>
            <p className="text-sm font-bold text-ink">Trợ lý chấm viết TOEIC tự do</p>
            <p className="text-xs text-muted">Nhập bất kỳ đề bài Email hoặc Essay nào để nhận điểm ước tính, sửa lỗi ngữ pháp và bài viết mẫu nâng cấp.</p>
          </div>
          <Link
            href="/writing"
            className="rounded-lg border border-line bg-surface-soft px-3.5 py-2 text-xs font-extrabold text-primary transition hover:border-primary"
          >
            Bộ đề TOEIC Writing Part 1–3 →
          </Link>
        </div>

        <section className="p-5 rounded-xl bg-surface border border-line">
          <AiWritingForm />
        </section>

        <SelectionDictionary
          compact
          learnerId={user.uid}
          vocabulary={null}
          vocabularyPool={[]}
          context={{ id: "ai-writing", title: "Phản hồi bài viết AI", sentence: "" }}
        >
        <section className="space-y-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {jobs.length === 0 && <div className="p-8 text-center text-muted">Chưa có bài viết nào được gửi.</div>}
        </section>
        </SelectionDictionary>
      </main>
    </>
  );
}

function JobCard({ job }: { job: AiWritingJob }) {
  const s = job.structuredFeedback;
  return (
    <article className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2.5">
          <strong className="text-ink">{job.status === "COMPLETED" ? "Đã hoàn thành" : job.status}</strong>
          {s?.scoreEstimate != null && (
            <span className="rounded-full bg-teal-soft px-3 py-0.5 text-xs font-extrabold text-teal-ink">
              Điểm ước tính: {s.scoreEstimate}/100
            </span>
          )}
        </div>
        <span className="text-xs text-muted">{formatDate(job.createdAtMillis)}</span>
      </div>

      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Đề bài</p>
        <p className="mt-1 text-sm font-semibold text-ink">{job.prompt}</p>
      </div>

      <div className="rounded-xl border border-line bg-surface-soft p-3.5">
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Bài viết của bạn</p>
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink2">{job.responseText}</p>
      </div>

      {s ? (
        <div className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {s.taskFulfillment && (
              <div className="rounded-xl border border-line bg-surface-soft p-3">
                <p className="text-xs font-extrabold uppercase text-muted">Đáp ứng yêu cầu đề</p>
                <p className="mt-1 text-sm text-ink">{s.taskFulfillment}</p>
              </div>
            )}
            {s.grammar && (
              <div className="rounded-xl border border-line bg-surface-soft p-3">
                <p className="text-xs font-extrabold uppercase text-muted">Ngữ pháp</p>
                <p className="mt-1 text-sm text-ink">{s.grammar}</p>
              </div>
            )}
            {s.vocabulary && (
              <div className="rounded-xl border border-line bg-surface-soft p-3">
                <p className="text-xs font-extrabold uppercase text-muted">Từ vựng</p>
                <p className="mt-1 text-sm text-ink">{s.vocabulary}</p>
              </div>
            )}
            {s.organization && (
              <div className="rounded-xl border border-line bg-surface-soft p-3">
                <p className="text-xs font-extrabold uppercase text-muted">Bố cục & Liên kết</p>
                <p className="mt-1 text-sm text-ink">{s.organization}</p>
              </div>
            )}
          </div>

          {s.strengths.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm text-emerald-950">
              <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">Điểm mạnh</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                {s.strengths.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {s.issues.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm text-amber-950">
              <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">Điểm cần cải thiện</p>
              <ul className="mt-2 space-y-2.5">
                {s.issues.map((issue, idx) => (
                  <li key={idx} className="rounded-lg bg-white/80 p-2.5">
                    <p className="font-bold text-ink">{issue.problem}</p>
                    {issue.fix && <p className="mt-0.5 text-xs text-ink2">Gợi ý sửa: {issue.fix}</p>}
                    {issue.example && <p className="mt-1 text-xs font-semibold text-teal-ink">Ví dụ: {issue.example}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.rewrittenAnswer && (
            <div className="rounded-xl border border-teal-line bg-teal-soft/50 p-3.5">
              <p className="text-xs font-extrabold uppercase tracking-wider text-teal-ink">Bài viết mẫu nâng cấp từ AI</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{s.rewrittenAnswer}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-primary">{job.feedback}</p>
      )}
    </article>
  );
}

function formatDate(value: number | null) {
  return value ? new Date(value).toLocaleString() : "";
}
