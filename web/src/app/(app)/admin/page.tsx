import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { dashboardMetrics } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

const modules = [
  { label: "Content quality", href: "/admin/content-quality" },
  { label: "Listening", href: "/admin/listening" },
  { label: "Reading", href: "/admin/reading" },
  { label: "Vocabulary", href: "/admin/vocabulary" },
  { label: "Mock test", href: "/admin/mock-test" },
  { label: "AI generator", href: "/admin/generate" },
  { label: "Review queue", href: "/admin/content-review" },
  { label: "Media", href: "/admin/media" },
  { label: "Nghe-chép", href: "/admin/dictation" },
];

export default async function AdminPage() {
  const user = await requireAdminPage();
  const metrics = await dashboardMetrics();

  return (
    <>
      <AppTopbar pageTitle="Admin" pageSubtitle="Content and learner operations" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {metrics.map((metric) => (
            <article key={metric.label} className="p-4 rounded-xl bg-surface border border-line">
              <span className="text-xs text-muted">{metric.label}</span>
              <h2 className="text-2xl font-bold text-ink">{metric.value}</h2>
            </article>
          ))}
        </section>

        <section className="p-5 rounded-xl bg-surface border border-line">
          <h2 className="font-bold text-ink">Modules</h2>
          <div className="flex flex-wrap gap-2 mt-4">
            {modules.map((module) => (
              <Link key={module.href} href={module.href} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">
                {module.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
