import styles from "../listen/_components/listening.module.css";
import VocabPageHeader from "./VocabPageHeader";
import VocabCatalogSkeleton from "./VocabCatalogSkeleton";

export default function VocabLoading() {
  return <main className={styles.dashboard}><div><VocabPageHeader /><VocabCatalogSkeleton /></div></main>;
}
