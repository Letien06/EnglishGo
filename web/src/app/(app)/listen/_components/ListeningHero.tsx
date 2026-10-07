import Link from "@/components/IntentLink";
import type { DauToeicPartTest } from "@/types/dautoeic";
import ListeningIcon from "./ListeningIcon";
import { practiceHref, resumePosition, summarizeTests, testProgress, type StudySkill } from "./listening-view-model";
import useListeningStreak from "./useListeningStreak";
import styles from "./listening.module.css";

export default function ListeningHero({ tests, part, skill = "listening", authenticated, progressReady, catalogLoading = false }: {
  tests: DauToeicPartTest[];
  part: number;
  skill?: StudySkill;
  authenticated: boolean;
  progressReady: boolean;
  catalogLoading?: boolean;
}) {
  const label = skill === "listening" ? "nghe" : "đọc";
  const icon = skill === "listening" ? "headphones" : "book";
  const summary = summarizeTests(tests);
  const resume = progressReady ? tests.find((test) => testProgress(test).status === "learning") : undefined;
  const next = resume ?? tests.find((test) => test.questionCount > 0 && testProgress(test).status === "new") ?? tests.find((test) => test.questionCount > 0);
  const streak = useListeningStreak(authenticated);

  return <section className={styles.hero} aria-label={`Tổng quan luyện ${label}`}>
    <div className={styles.resume}>
      <div className={styles.heroDecoration} aria-hidden="true"><ListeningIcon name={icon} />{skill === "listening" && <div className={styles.soundwave}>{[3, 6, 4, 9, 5, 12, 7, 10, 4, 7, 3].map((height, index) => <i key={index} style={{ height: `${height * 4}px` }} />)}</div>}</div>
      <span className={styles.eyebrow}><span className={styles.liveDot} /> MỖI NGÀY, TIẾN MỘT CHÚT</span>
      <h2>{resume ? "Tiếp tục nhịp học của bạn" : `Một bài ${label}, thêm tự tin.`}</h2>
      <p>{resume ? `${resume.testName} · Part ${part} · ${resumePosition(resume)}` : "Không cần học thật nhiều. Chỉ cần bắt đầu và đều đặn."}</p>
      <span className={styles.resumeSource} aria-hidden={!resume || undefined}>{resume ? `${resume.setName} · Đã làm ${resume.done}/${resume.questionCount} câu` : "\u00a0"}</span>
      <div className={styles.resumeActions}>
        {next ? <Link className={styles.primaryButton} href={practiceHref(next)} aria-label={resume ? `Tiếp tục học ${resume.testName} - ${resume.setName}` : `Bắt đầu bài ${label} được gợi ý`}>
          <ListeningIcon name={icon} />{resume ? "Tiếp tục học" : `Bắt đầu luyện ${label}`}<ListeningIcon name="arrow" />
        </Link> : <a className={styles.primaryButton} href="#listening-library">Khám phá bài {label}<ListeningIcon name="arrow" /></a>}
        <span className={styles.heroNote}><ListeningIcon name="spark" /> Từng câu nhỏ, tiến bộ lớn</span>
      </div>
    </div>
    <dl className={styles.stats}>
      <div className={styles.stat} data-tone="teal"><dt><span className={styles.statIcon}><ListeningIcon name="check" /></span>Câu đã làm</dt><dd>{progressReady ? summary.done : "—"}<span> / {catalogLoading ? "—" : summary.total}</span></dd><p>Trong Part {part} đang chọn</p></div>
      <div className={styles.stat} data-tone="blue"><dt><span className={styles.statIcon}><ListeningIcon name="target" /></span>Độ chính xác</dt><dd>{progressReady && summary.accuracy !== null ? summary.accuracy : "—"}<span> %</span></dd><p>{progressReady && summary.accuracy !== null ? "Tính trên câu đã trả lời" : "Sẽ hiện khi có kết quả"}</p></div>
      <div className={styles.stat} data-tone="gold"><dt><span className={styles.statIcon}><ListeningIcon name="flame" /></span>Chuỗi học</dt><dd>{streak ? streak.streakDays : "—"}<span> ngày</span></dd><p>{streak ? streak.studiedToday ? "Hôm nay đã học. Giữ nhịp nhé!" : "Học hôm nay để giữ chuỗi" : authenticated ? "Chưa có dữ liệu chuỗi học" : "Đăng nhập để giữ chuỗi"}</p></div>
    </dl>
  </section>;
}
