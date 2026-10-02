import type { ReactNode } from "react";
import Link from "@/components/IntentLink";
import Icon, { type ListeningIconName } from "../listen/_components/ListeningIcon";
import styles from "../listen/_components/listening.module.css";

export function LearningHero({ title, description, href, cta, icon, note, stats }: {
  title: string;
  description: string;
  href?: string;
  cta: string;
  icon: ListeningIconName;
  note: string;
  stats: Array<{ label: string; value: ReactNode; unit?: string; detail: string; icon: ListeningIconName }>;
}) {
  return <section className={styles.hero} aria-label="Tổng quan học tập">
    <div className={styles.resume}>
      <div className={styles.heroDecoration} aria-hidden="true"><Icon name={icon} /></div>
      <span className={styles.eyebrow}><span className={styles.liveDot} /> MỖI NGÀY, TIẾN MỘT CHÚT</span>
      <h2>{title}</h2><p>{description}</p>
      <div className={styles.resumeActions}>
        {href && <Link className={styles.primaryButton} href={href}><Icon name={icon} />{cta}<Icon name="arrow" /></Link>}
        <span className={styles.heroNote}><Icon name="spark" />{note}</span>
      </div>
    </div>
    <dl className={styles.stats}>{stats.map((stat, index) => <div key={stat.label} className={styles.stat} data-tone={["teal", "blue", "gold"][index]}>
      <dt><span className={styles.statIcon}><Icon name={stat.icon} /></span>{stat.label}</dt>
      <dd>{stat.value}<span>{stat.unit ? ` ${stat.unit}` : ""}</span></dd><p>{stat.detail}</p>
    </div>)}</dl>
  </section>;
}

export function LearningTip({ title, children }: { title: string; children: ReactNode }) {
  return <aside className={styles.tip}><span className={styles.tipIcon}><Icon name="spark" /></span><div><h2>{title}</h2><p>{children}</p></div><span className={styles.tipTag}>HỌC CÓ CHIẾN LƯỢC</span></aside>;
}

export function LearningEmpty({ title, description, onReset }: { title: string; description: string; onReset?: () => void }) {
  return <div className={styles.empty}>
    <div className={styles.emptyIllustration} aria-hidden="true"><Icon name="book" /><span><Icon name="search" /></span></div>
    <h3>{title}</h3><p>{description}</p>
    {onReset && <button type="button" className={styles.primaryButton} onClick={onReset}>Xóa bộ lọc<Icon name="reset" /></button>}
  </div>;
}
