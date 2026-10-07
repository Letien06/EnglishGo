import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { recentMedia } from "@/lib/services/media";
import AdminMediaUpload from "./AdminMediaUpload";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const user = await requireAdminPage();
  const assets = await recentMedia();
  return (
    <>
      <AppTopbar pageTitle="Tệp đa phương tiện" pageSubtitle="Tải tệp lên kho lưu trữ" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <section className="max-w-xl p-5 rounded-xl bg-surface border border-line">
          <AdminMediaUpload />
        </section>
        <section className="rounded-xl bg-surface border border-line overflow-hidden">
          {assets.map((asset) => (
            <article key={asset.id} className="p-4 border-b border-line last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong className="text-ink">{asset.originalFilename}</strong>
                  <p className="text-xs text-muted">{asset.mediaType} / {asset.contentType} / {formatBytes(asset.sizeBytes)}</p>
                </div>
                <a href={asset.publicUrl} target="_blank" rel="noreferrer" className="text-sm text-accent font-semibold">
                  Mở
                </a>
              </div>
            </article>
          ))}
          {assets.length === 0 && <div className="p-8 text-center text-muted">Chưa có tệp nào được tải lên.</div>}
        </section>
      </main>
    </>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round((value / 1024 / 1024) * 10) / 10} MB`;
}
