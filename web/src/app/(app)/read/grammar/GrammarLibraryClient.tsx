"use client";

import { useEffect, useState } from "react";
import Link from "@/components/IntentLink";
import ReadingSectionNav from "@/components/ReadingSectionNav";
import ListeningIcon from "../../listen/_components/ListeningIcon";
import { ListeningProgressRing } from "../../listen/_components/ListeningTestCard";
import styles from "../../listen/_components/listening.module.css";
import type { GrammarCatalog } from "@/lib/storage/grammar-snapshot";
import { GRAMMAR_GROUPS, grammarTopicGroup, grammarStorageKey, readGrammarAnswers, getGrammarProgress, type GrammarAnswerKey, type GrammarAnswers } from "@/lib/grammar-learning";

const groups = GRAMMAR_GROUPS;
type Group = typeof groups[number];
function groupFor(topic: GrammarCatalog["topics"][number]): Group {
  return grammarTopicGroup(topic.bigTopic);
}

export default function GrammarLibraryClient({ catalog, learnerId, answerKeys }: { catalog: GrammarCatalog | null; learnerId: string; answerKeys: Record<string, GrammarAnswerKey> }) {
  const [filter, setFilter] = useState<Group | "all">("all");
  const [answersByTopic, setAnswersByTopic] = useState<Record<string, GrammarAnswers>>({});
  const [progressReady, setProgressReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const topics = catalog?.topics ?? [];
  const totalQuestions = topics.reduce((sum, topic) => sum + topic.questionCount, 0);
  useEffect(() => {
    function refresh() {
      const answers: Record<string, GrammarAnswers> = {};
      try {
        for (const topic of catalog?.topics ?? []) answers[topic.id] = readGrammarAnswers(localStorage.getItem(grammarStorageKey(learnerId, topic.id)), answerKeys[topic.id] ?? {});
        setStorageAvailable(true);
      } catch { setStorageAvailable(false); }
      setAnswersByTopic(answers);
      setProgressReady(true);
    }
    // Restore device progress and refresh it when returning from a study page.
    refresh();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("pageshow", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); };
  }, [answerKeys, catalog, learnerId]);
  return <main className={styles.dashboard}>
    <ReadingSectionNav selected="grammar" />
    <header className={styles.intro}>
      <div><span className={styles.eyebrow}>LUYỆN ĐỌC</span><h1>Ngữ pháp<span>.</span></h1><p>Chọn chủ đề để luyện tập, xem giải thích và bản dịch sau mỗi câu.</p></div>
      <p className={styles.catalogTotal}><strong>{topics.length}</strong> chủ đề<span>·</span><strong>{totalQuestions.toLocaleString("vi-VN")}</strong> câu hỏi</p>
    </header>
    <nav aria-label="Nhóm chủ đề ngữ pháp" className={`${styles.toolbar} mt-5`}>
      <div className={styles.filters}>
        {(["all", ...groups] as const).map((group) => {
          const count = group === "all" ? topics.length : topics.filter((topic) => groupFor(topic) === group).length;
          return <button type="button" key={group} aria-label={group === "all" ? "Tất cả" : group} aria-pressed={filter === group} onClick={() => setFilter(group)}>{group === "all" ? "Tất cả" : group}<span>{count}</span></button>;
        })}
      </div>
    </nav>
    {!topics.length && <p className={`${styles.empty} mt-5`}>Chưa có bài ngữ pháp. Vui lòng thử lại sau.</p>}
    {groups.filter((group) => filter === "all" || filter === group).map((group) => {
      const entries = topics.filter((topic) => groupFor(topic) === group);
      if (!entries.length) return null;
      return <section key={group} aria-labelledby={`grammar-group-${groups.indexOf(group)}`} className={styles.testSet}>
        <div className={styles.setHeading}><h3 id={`grammar-group-${groups.indexOf(group)}`}><span />{group}</h3><span>{entries.length} chủ đề · {entries.reduce((sum, topic) => sum + topic.questionCount, 0).toLocaleString("vi-VN")} câu</span></div>
        <div className={styles.grid}>
          {entries.map((topic) => {
            const progress = getGrammarProgress(answerKeys[topic.id] ?? {}, answersByTopic[topic.id] ?? {});
            const progressKnown = progressReady && storageAvailable;
            const percent = topic.questionCount ? Math.round(progress.answered / topic.questionCount * 100) : 0;
            const status = progressKnown && progress.answered >= topic.questionCount ? "complete" : progressKnown && progress.answered > 0 ? "learning" : "new";
            const cta = status === "complete" ? "Ôn lại" : status === "learning" ? "Học tiếp" : "Học ngay";
            return <article key={topic.id} className={styles.card} data-status={progressKnown ? status : "unknown"} aria-label={`Ngữ pháp ${topic.title}`}>
              <div className={styles.cardTop}><span className={styles.cardLabel}>NGỮ PHÁP · {group.toUpperCase()}</span><span className={styles.badge} data-status={progressKnown ? status : "unknown"}><span />{progressKnown ? status === "complete" ? "Hoàn thành" : status === "learning" ? "Đang học" : "Mới" : "Chưa có tiến độ"}</span></div>
              <div className={styles.cardHeading}><div><h4>{topic.title}</h4><p>{progressKnown ? `${progress.answered}/${topic.questionCount} đã học` : `${topic.questionCount} câu hỏi`}</p></div><ListeningProgressRing percent={percent} ready={progressKnown} label={`Tiến độ ${topic.title}`} /></div>
              <div className={styles.answerStats}><span data-tone="good"><i /><strong>{progressKnown ? progress.correct : "—"}</strong> đúng</span><span data-tone="bad"><i /><strong>{progressKnown ? progress.wrong : "—"}</strong> sai</span><span><i /><strong>{progressKnown ? Math.max(0, topic.questionCount - progress.answered) : "—"}</strong> còn lại</span></div>
              <div className={styles.metadata}><span><ListeningIcon name="book" />{topic.subtopics.length} chuyên đề</span><span><ListeningIcon name="check" />{topic.questionCount} câu hỏi</span><span>{!progressReady ? "Đang đọc tiến độ…" : !storageAvailable ? "Thiết bị chưa sẵn sàng" : "Lưu trên thiết bị"}</span></div>
              <footer className={styles.cardFooter}><Link className={styles.cardCta} href={`/read/grammar/${encodeURIComponent(topic.slug)}`} aria-label={`${cta} ${topic.title}`}>{cta}<ListeningIcon name="arrow" /></Link></footer>
            </article>;
          })}
        </div>
      </section>;
    })}
  </main>;
}
