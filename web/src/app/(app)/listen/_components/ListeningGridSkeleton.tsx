import styles from "./listening.module.css";

export default function ListeningGridSkeleton() {
  return <div className={styles.grid} role="status" aria-label="Đang tải bài luyện tập" aria-busy="true">
    {Array.from({ length: 6 }, (_, index) => <div className={`${styles.card} ${styles.skeletonCard}`} key={index} aria-hidden="true">
      <div className={styles.cardTop}><div className={styles.skeletonLine} /><div className={styles.skeletonBadge} /></div>
      <div className={styles.cardHeading}><div className={styles.skeletonHeading}><div className={styles.skeletonLine} /><div className={styles.skeletonLine} /></div><div className={styles.skeletonCircle} /></div>
      <div className={styles.answerStats}>{[1, 2, 3].map((stat) => <span className={styles.skeletonStat} key={stat} />)}</div>
      <div className={styles.metadata}><div className={styles.skeletonLine} /></div>
      <div className={styles.cardFooter}><div className={styles.skeletonButton} /></div>
    </div>)}
  </div>;
}
