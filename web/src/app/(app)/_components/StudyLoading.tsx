export default function StudyLoading({ practice = false }: { practice?: boolean }) {
  return <div className="study-dashboard" role="status" aria-label="Đang mở bài học" aria-busy="true">
    <span className="study-eyebrow">{practice ? "ĐANG MỞ BÀI HỌC" : "KHÔNG GIAN LUYỆN TẬP"}</span>
    <div className="study-skeleton study-skeleton-title" />
    <div className="study-skeleton study-skeleton-tabs" />
    <div className="study-level-grid" aria-hidden="true">
      {Array.from({ length: practice ? 2 : 4 }, (_, index) => <div className="study-skeleton-card" key={index}>
        <div className="study-skeleton study-skeleton-line" /><div className="study-skeleton study-skeleton-line" />
      </div>)}
    </div>
  </div>;
}
