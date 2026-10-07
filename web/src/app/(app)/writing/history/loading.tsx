export default function WritingHistoryLoading() {
  return <main className="app-canvas min-h-[calc(100dvh-4rem)] px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Đang tải lịch sử bài viết"><div className="mx-auto max-w-5xl space-y-6 pb-10">
    <section className="premium-hero p-6 sm:p-8"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Writing history</p><h1 className="mt-3 text-3xl font-extrabold text-ink sm:text-4xl">Nhìn lại cách bạn viết</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">So sánh phản hồi theo từng lần nộp để chọn đúng kỹ năng cần cải thiện ở bài tiếp theo.</p></section>
    <section className="grid gap-3 sm:grid-cols-3">{["Bài đã nộp", "Điểm trung bình", "Dạng đã luyện"].map((label) => <article className="premium-metric px-4 py-4" key={label}><p className="text-xs font-bold text-muted">{label}</p><strong className="mt-1 block text-2xl font-extrabold text-ink">—</strong></article>)}</section>
    <section className="premium-card p-4 sm:p-5"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Danh sách bài nộp</p><h2 className="mt-1 text-xl font-extrabold text-ink">Phản hồi được lưu trên tài khoản của bạn</h2></section>
    <section className="space-y-3" role="status" aria-label="Đang tải lịch sử">{Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="h-56 rounded-2xl border border-line bg-surface-soft" />)}</section>
  </div></main>;
}
