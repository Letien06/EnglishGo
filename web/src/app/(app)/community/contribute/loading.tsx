import AppTopbar from "@/components/AppTopbar";

export default function ContributionLoading() {
  return <><AppTopbar pageTitle="Đóng góp nội dung" pageSubtitle="Gửi nội dung học tập để xét duyệt" /><main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8" aria-busy="true"><p className="sr-only" role="status">Đang tải biểu mẫu đóng góp</p><section className="max-w-2xl rounded-xl border border-line bg-surface p-5"><div className="space-y-4" aria-hidden="true">{["Tiêu đề", "Nội dung", "Ghi chú nguồn"].map((label, index) => <div key={label}><p className="text-sm font-semibold text-ink">{label}</p><div className={`mt-1 rounded-lg border border-line bg-surface-soft ${index === 1 ? "h-40" : "h-11"}`} /></div>)}<div className="h-5 w-64 max-w-full rounded bg-surface-soft" /><div className="h-10 w-32 rounded-lg bg-surface-soft" /></div></section></main></>;
}
