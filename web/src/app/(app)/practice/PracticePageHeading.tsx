import Link from "next/link";
import ListeningIcon from "../listen/_components/ListeningIcon";
import styles from "../listen/_components/listening.module.css";

export default function PracticePageHeading({ title, subtitle, showCatalogLink = false }: {
  title: string;
  subtitle: string;
  showCatalogLink?: boolean;
}) {
  return (
    <section aria-labelledby="practice-page-title">
      <div className={styles.topline}>
        <span className={styles.eyebrow}>KHÔNG GIAN LUYỆN TẬP</span>
      </div>
      <header className={styles.intro}>
        <div>
          <h1 id="practice-page-title">{title}<span>.</span></h1>
          <p>{subtitle}</p>
        </div>
        <Link className={styles.dictationLink} href={showCatalogLink ? "/practice" : "/practice/history"}>
          <ListeningIcon name={showCatalogLink ? "document" : "clock"} />
          {showCatalogLink ? "Chọn đề thi" : "Lịch sử làm bài"}
          <ListeningIcon name="arrow" />
        </Link>
      </header>
    </section>
  );
}
