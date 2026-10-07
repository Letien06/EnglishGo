import PracticePageHeading from "../../PracticePageHeading";
import styles from "../../../listen/_components/listening.module.css";

export default function PracticeReviewLoading() {
  return <main aria-busy="true" className={`${styles.dashboard} w-full min-w-0 flex-1 space-y-6`}>
    <PracticePageHeading title="Kết quả bài thi" subtitle="Đang tải kết quả bài thi." />
    <p role="status" className="sr-only">Đang tải kết quả và đáp án…</p>
    <div aria-hidden="true" className="mx-auto max-w-4xl space-y-6">
      <div className="mx-auto h-14 w-14 animate-pulse rounded-full bg-surface-soft" />
      <section className="space-y-5 rounded-xl border border-line bg-surface p-8">
        <div className="mx-auto h-16 w-32 animate-pulse rounded bg-surface-soft" />
        <div className="mx-auto h-5 w-52 max-w-full animate-pulse rounded bg-surface-soft" />
        <div className="h-32 animate-pulse rounded-xl bg-surface-soft" />
      </section>
      <section className="grid gap-4 md:grid-cols-2">{[1, 2].map((skill) => <div key={skill} className="h-48 animate-pulse rounded-xl border border-line bg-surface" />)}</section>
    </div>
  </main>;
}
