import Link from "@/components/IntentLink";
import NavIcon from "@/components/NavIcon";
import TestDashboardClient from "./TestDashboardClient";
import type { DauToeicPartTest } from "@/types/dautoeic";
import type { ListeningMetadata } from "../listen/_components/listening-view-model";

export const STUDY_PARTS = [
  { number: 1, name: "Hình ảnh", description: "Quan sát hình và chọn mô tả phù hợp." },
  { number: 2, name: "Hỏi - đáp", description: "Luyện phản xạ với câu hỏi và câu trả lời ngắn." },
  { number: 3, name: "Hội thoại", description: "Nghe hội thoại và trả lời theo từng tình huống." },
  { number: 4, name: "Bài nói ngắn", description: "Nắm ý chính trong thông báo và bài nói." },
  { number: 5, name: "Hoàn thành câu", description: "Luyện ngữ pháp và từ vựng qua từng câu hỏi." },
  { number: 6, name: "Hoàn thành đoạn", description: "Đọc ngữ cảnh và chọn từ hoặc câu còn thiếu." },
  { number: 7, name: "Đọc hiểu", description: "Đọc email, thông báo và các bài đọc theo cụm." },
] as const;

export default function StudyDashboard({ skill, part, tests, error, listeningMetadata }: {
  skill: "listening" | "reading";
  part: number;
  tests: DauToeicPartTest[];
  error: boolean;
  listeningMetadata?: ListeningMetadata;
}) {
  const listening = skill === "listening";
  if (listening) return <TestDashboardClient key={`${skill}:${part}`} skill={skill} part={part} initialTests={tests} initialError={error} listeningMetadata={listeningMetadata} />;
  const base = listening ? "/listen" : "/read";
  const active = STUDY_PARTS.find((entry) => entry.number === part)!;
  const parts = STUDY_PARTS.filter((entry) => listening ? entry.number <= 4 : entry.number >= 5);
  const total = tests.reduce((sum, test) => sum + test.questionCount, 0);

  return (
    <main className={`study-dashboard study-dashboard--${listening ? "listen" : "read"}`}>
      <div className="study-dashboard-topline">
        <span className="study-eyebrow">KHÔNG GIAN LUYỆN TẬP</span>
        <nav className="study-skill-switch" aria-label="Kỹ năng luyện tập">
          <Link href="/listen" aria-current={listening ? "page" : undefined}><NavIcon name="listen" />Nghe</Link>
          <Link href="/read" aria-current={!listening ? "page" : undefined}><NavIcon name="read" />Đọc</Link>
        </nav>
      </div>
      <header className="study-intro">
        <div>
          <h1>Luyện {listening ? "nghe" : "đọc"}<span className="study-heading-dot">.</span></h1>
          <p>Chọn Part, chọn test và học đúng bài trong bộ đề.</p>
        </div>
        {listening && <Link className="study-extra-link" href="/listen/dictation">Nghe - chép video<NavIcon name="arrow-right" /></Link>}
      </header>
      <nav className="study-part-tabs" aria-label={listening ? "Các phần luyện nghe" : "Các phần luyện đọc"}>
        {parts.map((entry) => (
          <Link key={entry.number} href={`${base}?part=part${entry.number}`} aria-current={part === entry.number ? "page" : undefined}>
            <span>Part {entry.number}</span><strong>{entry.name}</strong>
          </Link>
        ))}
      </nav>
      <section className="study-section" aria-labelledby="study-section-heading">
        <div className="study-section-heading">
          <div><h2 id="study-section-heading">Part {part} <span>/</span> {active.name}</h2><p>{active.description}</p></div>
          {!error && <span className="study-total">{tests.length} test · {total} câu hỏi</span>}
        </div>
        <TestDashboardClient key={`${skill}:${part}`} skill={skill} part={part} initialTests={tests} initialError={error} />
        {!error && <p className="study-caption">Mỗi test chỉ gồm Part {part} của đề tương ứng. Tiến độ được giữ theo từng câu hỏi.</p>}
      </section>
    </main>
  );
}
