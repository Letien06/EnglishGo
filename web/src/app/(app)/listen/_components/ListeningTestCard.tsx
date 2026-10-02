import type { CSSProperties } from "react";
import Link from "@/components/IntentLink";
import ResetLevelButton from "@/components/ResetLevelButton";
import { invalidateLearningLevels } from "@/lib/client-learning-progress-cache";
import type { DauToeicPartTest } from "@/types/dautoeic";
import ListeningIcon from "./ListeningIcon";
import { estimatedMinutes, practiceHref, testProgress, type ListeningTestMetadata } from "./listening-view-model";
import styles from "./listening.module.css";

const STATUS_LABELS = { new: "Mới", learning: "Đang học", complete: "Hoàn thành" };

export function ListeningProgressRing({ percent, label, ready = true }: { percent: number; label: string; ready?: boolean }) {
  return <div className={styles.ring} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready ? percent : undefined} aria-valuetext={ready ? `${percent}%` : "Chưa có tiến độ"}>
    <svg viewBox="0 0 80 80" aria-hidden="true"><circle className={styles.ringTrack} cx="40" cy="40" r="34" /><circle className={styles.ringValue} cx="40" cy="40" r="34" pathLength="100" strokeDasharray={`${ready ? percent : 0} 100`} /></svg>
    <span>{ready ? percent : "—"}{ready && <small>%</small>}</span>
  </div>;
}

export default function ListeningTestCard({ test, index, progressReady, metadata }: { test: DauToeicPartTest; index: number; progressReady: boolean; metadata?: ListeningTestMetadata }) {
  const skill = test.part >= 5 ? "reading" : "listening";
  const progress = testProgress(test);
  const cta = progress.status === "complete" ? "Ôn lại" : progress.status === "learning" ? "Học tiếp" : "Bắt đầu";
  return <article className={styles.card} data-status={progressReady ? progress.status : "unknown"} style={{ "--card-delay": `${Math.min(index, 5) * 35}ms` } as CSSProperties} aria-label={`${test.testName} - ${test.setName}`}>
    <div className={styles.cardTop}><span className={styles.cardLabel}>LUYỆN {skill === "reading" ? "ĐỌC" : "NGHE"} · PART {test.part}</span><span className={styles.badge} data-status={progressReady ? progress.status : "unknown"}><span />{progressReady ? STATUS_LABELS[progress.status] : "Chưa có tiến độ"}</span></div>
    <div className={styles.cardHeading}><div><h4>{test.testName}</h4><p>{progressReady ? `${progress.done}/${progress.total} đã học` : "Mở bài mà không cần chờ"}</p></div><ListeningProgressRing percent={progress.percent} ready={progressReady} label={`Tiến độ ${test.testName} - ${test.setName}`} /></div>
    <div className={styles.answerStats}>
      <span data-tone="good"><i /><strong>{progressReady ? test.correct : "—"}</strong> đúng</span>
      <span data-tone="bad"><i /><strong>{progressReady ? test.wrong : "—"}</strong> sai</span>
      <span><i /><strong>{progressReady ? progress.remaining : "—"}</strong> còn lại</span>
    </div>
    <div className={styles.metadata}><span><ListeningIcon name={skill === "reading" ? "book" : "headphones"} />{test.questionCount} câu</span><span title="Thời lượng luyện tập ước tính, không phải giới hạn thời gian"><ListeningIcon name="clock" />~{estimatedMinutes(test)} phút</span><span title={metadata?.difficultyLevel ? "Mức độ khó của đề nguồn, không phải đánh giá riêng Part" : "Nguồn chưa cung cấp mức độ khó cho test này"}><ListeningIcon name="bars" />{metadata?.difficultyLevel ? `Mức ${metadata.difficultyLevel}` : "Chưa phân loại"}</span>{metadata?.year && <span>Năm {metadata.year}</span>}</div>
    <footer className={styles.cardFooter}>
      {test.done > 0 && progressReady && <span className={styles.reset}><ListeningIcon name="reset" /><ResetLevelButton part={test.part} level={1} testId={test.testId} testName={`${test.testName} - ${test.setName}`} endpoint={`/api/${skill}/reset`} onReset={() => invalidateLearningLevels(skill, [test.part])} /></span>}
      {test.questionCount > 0 ? <Link className={styles.cardCta} href={practiceHref(test)} aria-label={`${cta} ${test.testName} - ${test.setName}`}>{cta}<ListeningIcon name="arrow" /></Link> : <span className={styles.unavailable}>Chưa có câu hỏi</span>}
    </footer>
  </article>;
}
