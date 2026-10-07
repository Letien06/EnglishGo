import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { dashboardMetrics } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

const modules = [
  { label: "Chất lượng nội dung", href: "/admin/content-quality" },
  { label: "Nghe", href: "/admin/listening" },
  { label: "Đọc", href: "/admin/reading" },
  { label: "Từ vựng", href: "/admin/vocabulary" },
  { label: "Thi thử", href: "/admin/mock-test" },
  { label: "Tạo nội dung bằng AI", href: "/admin/generate" },
  { label: "Biên soạn bài viết", href: "/admin/writing" },
  { label: "Hàng đợi duyệt", href: "/admin/content-review" },
  { label: "Tệp đa phương tiện", href: "/admin/media" },
  { label: "Nghe-chép", href: "/admin/dictation" },
];

export default async function AdminPage() {
  const user = await requireAdminPage();
  const metrics = await dashboardMetrics();

  return (
    <>
      <AppTopbar pageTitle="Quản trị" pageSubtitle="Quản lý nội dung và học viên" userName={user.displayName} userEmail={user.email} />
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
          <h2 className="font-bold text-ink">Các phân hệ</h2>
          <div className="flex flex-wrap gap-2 mt-4">
            {modules.map((module) => (
              <Link key={module.href} href={module.href} className="px-4 py-2 rounded-lg bg-accent text-gold-ink text-sm font-semibold">
                {module.label}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
