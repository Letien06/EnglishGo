import styles from "./listening.module.css";

export function ListeningGridSkeleton() {
  return <div className={styles.grid} role="status" aria-label="Đang tải bài luyện tập" aria-busy="true">
    {Array.from({ length: 6 }, (_, index) => <div className={styles.skeletonCard} key={index} aria-hidden="true"><div className={styles.skeletonLine} /><div className={styles.skeletonCircle} /><div className={styles.skeletonLine} /><div className={styles.skeletonLine} /></div>)}
  </div>;
}

export default function ListeningLoading() {
  return <div className={styles.dashboard}>
    <span className={styles.eyebrow}>KHÔNG GIAN LUYỆN TẬP</span>
    <div className={styles.skeletonTitle} aria-hidden="true" />
    <div className={styles.skeletonHero} aria-hidden="true" />
    <div className={styles.skeletonTabs} aria-hidden="true">{[1, 2, 3, 4].map((part) => <div key={part} />)}</div>
    <ListeningGridSkeleton />
  </div>;
}
