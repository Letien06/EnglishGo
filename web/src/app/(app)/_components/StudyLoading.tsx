export default function StudyLoading({ practice = false, readingPart }: { practice?: boolean; readingPart?: number }) {
  const singleQuestion = readingPart === 5;
  if (practice) return <main className={`skill-workspace design-system min-h-dvh bg-surface ${readingPart ? "skill-workspace--read" : ""}`} role="status" aria-label="Đang mở bài học" aria-busy="true">
    <header className="practice-toolbar" aria-hidden="true"><span className="practice-back study-skeleton" /><div className="practice-title"><div className="study-skeleton practice-placeholder-label" /><div className="study-skeleton practice-placeholder-title" /></div><div className="study-skeleton practice-placeholder-control" /></header>
    <div className={`practice-content grid min-h-[calc(100dvh-8rem)] lg:grid-cols-[1fr_1fr] ${singleQuestion ? "practice-content--single" : ""}`} aria-hidden="true">
      <section className="practice-source-pane border-b border-line px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r lg:px-10 lg:py-8"><div className="study-skeleton practice-placeholder-instruction" />{!readingPart && <div className="practice-audio-card rounded-2xl border border-line bg-surface p-4"><div className="study-skeleton practice-placeholder-audio" /><div className="study-skeleton practice-placeholder-label" /></div>}<div className="study-skeleton practice-placeholder-source" /></section>
      <section className="practice-question-pane px-4 py-5 sm:px-6 lg:px-10 lg:py-8"><div className="study-skeleton practice-placeholder-instruction" /><div className="practice-question-card rounded-2xl border border-line p-5"><div className="study-skeleton practice-placeholder-question" />{[1, 2, 3, 4].map((answer) => <div className="study-skeleton practice-placeholder-answer" key={answer} />)}</div></section>
    </div>
    <footer className="skill-workspace-footer sticky bottom-0 z-40 flex h-16 items-center justify-between gap-2 px-3 sm:px-7" aria-hidden="true"><div className="study-skeleton practice-placeholder-control" /><div className="study-skeleton practice-placeholder-control" /></footer>
  </main>;
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
