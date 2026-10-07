import { HistoryLoadingRows } from "@/components/PageLoadingSkeleton";
import PracticePageHeading from "../PracticePageHeading";
import styles from "../../listen/_components/listening.module.css";

export default function Loading() {
  return (
    <main aria-busy="true" className={`${styles.dashboard} w-full min-w-0 flex-1 space-y-6`}>
      <PracticePageHeading title="Lịch sử làm bài" subtitle="Xem lại kết quả và đáp án của những bài đã nộp." showCatalogLink />
      <p role="status" className="sr-only">Đang tải dữ liệu…</p>
      <HistoryLoadingRows />
    </main>
  );
}
