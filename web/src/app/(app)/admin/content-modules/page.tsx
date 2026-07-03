import AppTopbar from "@/components/AppTopbar";
import { requireRole } from "@/lib/auth/session";
import { moduleMetrics } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

export default async function AdminContentModulesPage() {
  const user = await requireRole("ADMIN");
  const metrics = await moduleMetrics();
  return (
    <>
      <AppTopbar pageTitle="Content modules" pageSubtitle="Manage content by TOEIC module" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <article key={metric.label} className="p-5 rounded-xl bg-surface border border-line">
              <span className="text-xs text-muted">{metric.label}</span>
              <h2 className="text-3xl font-bold text-ink">{metric.value}</h2>
            </article>
          ))}
        </section>
      </main>
    </>
  );
}
