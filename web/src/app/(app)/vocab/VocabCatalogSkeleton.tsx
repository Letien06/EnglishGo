import styles from "../listen/_components/listening.module.css";
import vocabStyles from "./[setId]/flashcards/vocabulary.module.css";

export default function VocabCatalogSkeleton() {
  return <section role="status" aria-label="Đang tải bộ từ vựng" aria-busy="true">
    <div aria-hidden="true">
      <div className={vocabStyles.catalogIntro}>
        <div><span className={vocabStyles.eyebrow}>HỌC ÍT MỖI NGÀY · NHỚ LÂU HƠN</span><h2>Kho từ vựng của bạn</h2><p>Xem từ, học trong ngữ cảnh, rồi thử sức với trò chơi.</p></div>
        <div className={vocabStyles.catalogSummary}><span><strong>—</strong> từ đã thuộc</span><span><strong>—</strong> cần ôn</span><span className={`${vocabStyles.button} ${vocabStyles.catalogSummaryAction} ${vocabStyles.catalogPlaceholder}`} /></div>
      </div>
      <div className={styles.sectionLabel}><span className={styles.eyebrow}>01 / CHỌN BỘ ĐỀ</span><span>Một ít mỗi ngày, nhớ lâu hơn</span></div>
      <div className={styles.filters}>{[1, 2, 3].map((id) => <span key={id} className={vocabStyles.catalogGroupPlaceholder} />)}</div>
      <section className={styles.library}>
        <div className={styles.libraryHeading}><div><span className={styles.eyebrow}>02 / BỘ TỪ CỦA BẠN</span><h2>Thư viện từ vựng</h2></div><span className={vocabStyles.catalogPlaceholder} style={{ width: 150, height: 20 }} /></div>
        <div className={styles.toolbar}>
          <div className={styles.filters}>{["Tất cả", "Chưa học", "Đang học", "Đã thuộc", "Cần ôn"].map((label) => <button key={label} disabled tabIndex={-1}>{label}</button>)}</div>
          <div className={styles.tools}><span className={`${styles.search} ${vocabStyles.catalogPlaceholder}`} style={{ height: 40 }} /><span className={`${styles.sort} ${vocabStyles.catalogPlaceholder}`} style={{ width: 160, height: 40 }} /></div>
        </div>
        <div className={vocabStyles.catalogStatus} />
        <p className={styles.resultCount}>Đang tải bộ từ…</p>
        <div className={vocabStyles.catalogGrid}>{Array.from({ length: 8 }, (_, index) => <article key={index} className={vocabStyles.catalogCard}>
          <div className={vocabStyles.catalogTop}><span>—</span><small>—</small></div>
          <h3><span className={vocabStyles.catalogPlaceholder} style={{ width: "75%", height: 24 }} /></h3>
          <p><span className={vocabStyles.catalogPlaceholder} style={{ width: "65%", height: 14 }} /></p>
          <div className={vocabStyles.progress} />
          <div className={vocabStyles.catalogActions}>{[1, 2, 3, 4].map((id) => <span key={id} className={`${vocabStyles.catalogActionSlot} ${vocabStyles.catalogPlaceholder}`} />)}</div>
        </article>)}</div>
      </section>
    </div>
  </section>;
}
