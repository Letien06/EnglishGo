import Link from "next/link";
import styles from "../listen/_components/listening.module.css";
import Icon from "../listen/_components/ListeningIcon";

export const vocabTabs = [
  { key: "learn", label: "Học", icon: "book" },
  { key: "progress", label: "Tiến độ", icon: "target" },
  { key: "my", label: "Từ vựng của tôi", icon: "document" },
  { key: "algorithm", label: "Thuật toán học từ", icon: "spark" },
  { key: "community", label: "Cộng đồng", icon: "conversation" },
] as const;

export default function VocabPageHeader({ active }: { active?: string }) {
  return <>
    <span className={styles.eyebrow}>KHÔNG GIAN LUYỆN TẬP</span>
    <header className={styles.intro}><div><h1>Từ vựng<span>.</span></h1><p>Học qua trò chơi. Ghi nhớ bằng lặp lại ngắt quãng.</p></div></header>
    <nav className={styles.pageTabs} aria-label="Các mục từ vựng">
      {vocabTabs.map((tab) => <Link key={tab.key} href={`/vocab?tab=${tab.key}`} data-overdelay={`Đang mở ${tab.label}...`} aria-current={active === tab.key ? "page" : undefined}><Icon name={tab.icon} />{tab.label}</Link>)}
    </nav>
  </>;
}
