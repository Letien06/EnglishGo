import AppTopbar from "@/components/AppTopbar";
import { requireUserForRead } from "@/lib/auth/session";
import { recentJobs } from "@/lib/services/ai-writing";
import AiWritingForm from "./AiWritingForm";

export const dynamic = "force-dynamic";

export default async function AiWritingPage() {
  const user = await requireUserForRead();
  const jobs = await recentJobs(user.uid);

  return (
    <>
      <AppTopbar pageTitle="AI Writing" pageSubtitle="Get quick writing feedback" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <section className="p-5 rounded-xl bg-surface border border-line">
          <AiWritingForm />
        </section>
        <section className="space-y-3">
          {jobs.map((job) => (
            <article key={job.id} className="p-5 rounded-xl bg-surface border border-line">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-ink">{job.status}</strong>
                <span className="text-xs text-muted">{formatDate(job.createdAtMillis)}</span>
              </div>
              <p className="text-sm text-muted mt-2">{job.prompt}</p>
              <p className="text-sm text-ink2 mt-3 whitespace-pre-wrap">{job.responseText}</p>
              <p className="text-sm text-primary mt-3">{job.feedback}</p>
            </article>
          ))}
          {jobs.length === 0 && <div className="p-8 text-center text-muted">No writing jobs yet.</div>}
        </section>
      </main>
    </>
  );
}

function formatDate(value: number | null) {
  return value ? new Date(value).toLocaleString() : "";
}
