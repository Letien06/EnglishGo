import Link from "next/link";
import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { moduleMetrics } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

const titles: Record<string, string> = {
  listening: "Nghe",
  reading: "Đọc",
  vocabulary: "Từ vựng",
  "mock-test": "Thi thử",
};

interface Props {
  params: Promise<{ module: string }>;
}

export default async function AdminModulePage({ params }: Props) {
  const user = await requireAdminPage();
  const { module } = await params;
  const title = titles[module] ?? "Phân hệ nội dung";
  const metrics = await moduleMetrics();

  return (
    <>
      <AppTopbar pageTitle={title} pageSubtitle="Tổng quan phân hệ" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-4">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric) => (
            <article key={metric.label} className="p-5 rounded-xl bg-surface border border-line">
              <span className="text-xs text-muted">{metric.label}</span>
              <h2 className="text-3xl font-bold text-ink">{metric.value}</h2>
            </article>
          ))}
        </section>
        <Link href="/admin/content-modules" className="inline-block px-4 py-2 rounded-lg bg-surface-soft text-ink text-sm font-semibold">
          Xem các phân hệ nội dung
        </Link>
      </main>
    </>
  );
}
