import AppTopbar from "@/components/AppTopbar";
import { requireRole } from "@/lib/auth/session";
import { draftQueue } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export default async function AdminContentReviewPage() {
  const user = await requireRole("ADMIN");
  const drafts = await draftQueue();
  return (
    <>
      <AppTopbar pageTitle="Content review" pageSubtitle="Approve drafts before publishing" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-4">
        <section className="p-5 rounded-xl bg-surface border border-line">
          <span className="text-xs text-muted">Draft queue</span>
          <h2 className="text-3xl font-bold text-ink">{drafts.length}</h2>
          <p className="text-sm text-muted">Draft entries are counted from content audit logs.</p>
        </section>
        <section className="rounded-xl bg-surface border border-line overflow-hidden">
          {drafts.map((draft) => (
            <article key={draft.id} className="p-4 border-b border-line last:border-0">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-ink">{draft.title}</strong>
                <span className="text-xs text-primary">{draft.status}</span>
              </div>
              <p className="text-sm text-muted mt-1">
                {draft.action} / {draft.displayName ?? "system"} / {formatDate(draft.createdAtMillis)}
              </p>
            </article>
          ))}
          {drafts.length === 0 && <div className="p-8 text-center text-muted">No draft content waiting for review.</div>}
        </section>
      </main>
    </>
  );
}

function formatDate(value: number | null) {
  return value ? new Date(value).toLocaleString() : "";
}
