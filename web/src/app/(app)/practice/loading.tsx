import PracticePageHeading from "./PracticePageHeading";
import styles from "../listen/_components/listening.module.css";

export default function PracticeLoading() {
  return <main aria-busy="true" className={`${styles.dashboard} w-full min-w-0 flex-1 space-y-6`}>
    <PracticePageHeading title="Luyện đề TOEIC" subtitle="Thi thử trọn bộ hoặc luyện từng Part, theo nhịp học của bạn." />
    <p role="status" className="sr-only">Đang tải danh sách đề thi…</p>
    <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => <article key={index} className="premium-card space-y-4 p-5">
        <div className="h-5 w-3/4 animate-pulse rounded bg-surface-soft" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-soft" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-soft" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface-soft" />
        <div className="flex gap-2">{[1, 2, 3].map((control) => <div key={control} className="h-10 flex-1 animate-pulse rounded-lg bg-surface-soft" />)}</div>
      </article>)}
    </div>
  </main>;
}
