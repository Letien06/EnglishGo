"use client";

import { useState, type ReactNode } from "react";
import Link from "@/components/IntentLink";
import NavIcon from "@/components/NavIcon";
import type { DauToeicPartTest } from "@/types/dautoeic";
import ListeningHero from "./ListeningHero";
import ListeningIcon from "./ListeningIcon";
import ListeningParts from "./ListeningParts";
import ListeningToolbar from "./ListeningToolbar";
import ListeningTestCard from "./ListeningTestCard";
import ListeningGridSkeleton from "./ListeningGridSkeleton";
import useListeningPartProgress from "./useListeningPartProgress";
import { filterTests, studyParts, type StudySkill, summarizeTests, testProgress, type ListeningMetadata, type PartProgress, type TestFilter, type TestSort } from "./listening-view-model";
import styles from "./listening.module.css";
import ReadingSectionNav, { type ReadingSection } from "@/components/ReadingSectionNav";

export default function ListeningDashboard({ tests, part, skill = "listening", initialError, progressError, progressReady, authenticated, partProgress = {}, metadata = {}, catalogLoading = false, libraryTools }: {
  tests: DauToeicPartTest[];
  part: number;
  skill?: StudySkill;
  initialError: boolean;
  progressError: boolean;
  progressReady: boolean;
  authenticated: boolean;
  partProgress?: Partial<Record<number, PartProgress>>;
  metadata?: ListeningMetadata;
  catalogLoading?: boolean;
  libraryTools?: ReactNode;
}) {
  const [filter, setFilter] = useState<TestFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TestSort>("catalog");
  const otherParts = useListeningPartProgress(part, skill === "listening" && authenticated && progressReady && !initialError, skill);
  const parts = studyParts(skill);
  const active = parts.find((entry) => entry.number === part) ?? parts[0];
  const listening = skill === "listening";
  const label = listening ? "nghe" : "đọc";
  const summary = summarizeTests(tests);
  const activeSort = !progressReady && sort.startsWith("progress") ? "catalog" : sort;
  const visible = filterTests(tests, progressReady ? filter : "all", query, activeSort, metadata);
  const groups = [...new Set(visible.map((test) => test.setName))];
  const counts = tests.reduce((result, test) => { result[testProgress(test).status] += 1; return result; }, { all: tests.length, new: 0, learning: 0, complete: 0 });
  const progress = { ...partProgress, ...otherParts, ...(progressReady && !initialError ? { [part]: summary } : {}) };

  return <main className={styles.dashboard} aria-busy={catalogLoading || undefined}>
    <div className={styles.topline}><span className={styles.eyebrow}>KHÔNG GIAN LUYỆN TẬP</span><nav className={styles.skillSwitch} aria-label="Kỹ năng luyện tập"><Link href="/listen" aria-current={listening ? "page" : undefined}><NavIcon name="listen" />Nghe</Link><Link href="/read" aria-current={!listening ? "page" : undefined}><NavIcon name="read" />Đọc</Link></nav></div>
    {!listening && <ReadingSectionNav selected={`part${part}` as ReadingSection} />}
    <header className={styles.intro}><div><h1>Luyện {label}<span>.</span></h1><p>{listening ? "Lắng nghe tốt hơn. Tự tin hơn mỗi ngày." : "Hiểu từng câu chữ. Chinh phục từng bài đọc."}</p></div>{listening && <Link className={styles.dictationLink} href="/listen/dictation"><ListeningIcon name={listening ? "headphones" : "book"} />Nghe - chép video<ListeningIcon name="arrow" /></Link>}</header>
    <ListeningHero skill={skill} tests={initialError ? [] : tests} part={part} authenticated={authenticated} progressReady={progressReady && !initialError} catalogLoading={catalogLoading} />
    {listening && <><div className={styles.sectionLabel}><span className={styles.eyebrow}>01 / CHỌN KỸ NĂNG</span><span>Một Part mỗi lần, tập trung hơn</span></div><ListeningParts skill={skill} part={part} progress={progress} /></>}
    {libraryTools}
    <section id="listening-library" className={styles.library} aria-labelledby="listening-library-title">
      <div className={styles.libraryHeading}><div><span className={styles.eyebrow}>02 / BÀI LUYỆN CỦA BẠN</span><h2 id="listening-library-title">Part {part}<span> / </span>{active.name}</h2></div>{!initialError && <p className={styles.catalogTotal}><strong>{catalogLoading ? "—" : tests.length}</strong> test<span>·</span><strong>{catalogLoading ? "—" : summary.total}</strong> câu hỏi</p>}</div>
      {initialError ? <div className={styles.empty} role="alert"><ListeningIcon name={listening ? "headphones" : "book"} /><h3>Chưa tải được danh sách test</h3><p>Tiến độ của bạn vẫn được giữ nguyên. Hãy tải lại để thử lần nữa.</p><button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>Tải lại trang<ListeningIcon name="reset" /></button></div> : <>
        <ListeningToolbar filter={progressReady ? filter : "all"} query={query} sort={activeSort} counts={counts} onFilter={setFilter} onQuery={setQuery} onSort={setSort} progressReady={progressReady} hasYears={tests.some((test) => metadata[test.testId]?.year)} />
        <div className={styles.noticeSlot}>
          {progressError && <p role="status" aria-label="Trạng thái tiến độ" className={styles.notice}>Chưa cập nhật được tiến độ. Bạn vẫn có thể mở bài.</p>}
          {!progressReady && !progressError && <p className={styles.notice} role="status">{catalogLoading ? "Đang tải danh sách bài luyện tập." : "Đang tải tiến độ cá nhân. Bạn có thể bắt đầu bài ngay."}</p>}
        </div>
        <p className={styles.resultCount} aria-live="polite">{catalogLoading ? "Đang tải các test…" : <>Hiển thị {visible.length}/{tests.length} test{query.trim() ? ` cho “${query.trim()}”` : ""}</>}</p>
        {catalogLoading && <section className={styles.testSet}><div className={styles.setHeading} aria-hidden="true"><div className={styles.skeletonLine} /></div><ListeningGridSkeleton /></section>}
        {groups.map((setName) => <section className={styles.testSet} key={setName} aria-label={setName}>
          <div className={styles.setHeading}><h3><span />{setName}</h3><span>{visible.filter((test) => test.setName === setName).length} test</span></div>
          <div className={styles.grid}>{visible.filter((test) => test.setName === setName).map((test, index) => <ListeningTestCard key={test.testId} test={test} index={index} progressReady={progressReady} metadata={metadata[test.testId]} />)}</div>
        </section>)}
        {!catalogLoading && !visible.length && <div className={styles.empty}><div className={styles.emptyIllustration} aria-hidden="true"><ListeningIcon name={listening ? "headphones" : "book"} /><span><ListeningIcon name="search" /></span></div><h3>{tests.length ? `Chưa tìm thấy bài ${label} phù hợp` : `Part này chưa có bài ${label}`}</h3><p>{tests.length ? "Thử một tên test khác hoặc bỏ bộ lọc để khám phá thêm bài học." : "Bạn có thể chọn một Part khác để tiếp tục luyện tập."}</p>{tests.length > 0 && <button className={styles.primaryButton} type="button" onClick={() => { setFilter("all"); setQuery(""); }}>Xóa bộ lọc<ListeningIcon name="reset" /></button>}</div>}
        <p className={styles.caption}>Mỗi test chỉ gồm Part {part} của đề tương ứng. Tiến độ được giữ theo từng câu hỏi. Thời lượng là ước tính.</p>
      </>}
    </section>
    <aside className={styles.tip}><span className={styles.tipIcon}><ListeningIcon name="spark" /></span><div><h2>Mẹo luyện Part {part}</h2><p>{active.tip}</p></div><span className={styles.tipTag}>HỌC CÓ CHIẾN LƯỢC</span></aside>
  </main>;
}
