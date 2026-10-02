"use client";

import { useLinkStatus } from "next/link";
import Link from "@/components/IntentLink";
import ListeningIcon from "./ListeningIcon";
import { studyParts, type StudySkill, type PartProgress } from "./listening-view-model";
import styles from "./listening.module.css";

function PartContent({ entry, progress }: { entry: ReturnType<typeof studyParts>[number]; progress?: PartProgress }) {
  const { pending } = useLinkStatus();
  return <>
    <span className={styles.partIcon}><ListeningIcon name={entry.icon} /></span>
    <span className={styles.partText}><span>PART {entry.number}</span><strong>{entry.name}</strong><small>{entry.description}</small></span>
    <span className={styles.partProgress} aria-live="polite">{pending ? "Đang mở Part…" : progress ? `${progress.done}/${progress.total} câu` : "Mở để xem tiến độ"}</span>
    <span className={styles.partTrack} aria-hidden="true"><span style={{ width: progress?.total ? `${Math.min(100, progress.done / progress.total * 100)}%` : "0%" }} /></span>
    {pending && <span className={styles.partPending} aria-hidden="true"><i /><i /><i /></span>}
  </>;
}

export default function ListeningParts({ part, progress, skill = "listening" }: { skill?: StudySkill; part: number; progress: Partial<Record<number, PartProgress>> }) {
  return <nav className={styles.parts} data-columns={skill === "reading" ? "3" : "4"} aria-label={skill === "reading" ? "Các phần luyện đọc" : "Các phần luyện nghe"}>
    {studyParts(skill).map((entry) => <Link key={entry.number} className={styles.part} href={`/${skill === "reading" ? "read" : "listen"}?part=part${entry.number}`} aria-label={`Part ${entry.number}: ${entry.name}`} aria-current={part === entry.number ? "page" : undefined}>
      <PartContent entry={entry} progress={progress[entry.number]} />
    </Link>)}
  </nav>;
}
