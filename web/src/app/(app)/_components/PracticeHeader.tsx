"use client";

import Link from "@/components/IntentLink";
import NavIcon from "@/components/NavIcon";
import PracticeMobileMenu, { type PracticeMode } from "./PracticeMobileMenu";

interface Props {
  skill: "listening" | "reading";
  partId: string;
  part: number;
  level: number;
  grouped: boolean;
  modes: Array<[PracticeMode, string, string]>;
  activeMode: PracticeMode;
  onModeChange: (mode: PracticeMode) => void;
  auto: boolean;
  onToggleAuto: () => void;
  elapsed: string;
  assist?: number;
  onAssistChange?: (value: number) => void;
}

export default function PracticeHeader({ skill, partId, part, level, grouped, modes, activeMode, onModeChange, auto, onToggleAuto, elapsed, assist = 0, onAssistChange }: Props) {
  const base = skill === "listening" ? "/listen" : "/read";
  const assistOptions = skill === "listening" ? [30, 50, 100] : [];
  return <header className="skill-workspace-header practice-toolbar">
    <Link className="practice-back" href={`${base}?part=${partId}`} aria-label="Quay lại danh sách bài"><NavIcon name="arrow-right" /></Link>
    <div className="practice-title"><span>{skill === "listening" ? "LUYỆN NGHE" : "LUYỆN ĐỌC"}</span><h1>Part {part} · {grouped ? "Nhóm" : "Cấp"} {level}</h1></div>
    <nav className="practice-modes" aria-label="Chế độ luyện tập">
      {modes.map(([key, , label]) => <button type="button" key={key} aria-pressed={key === activeMode} onClick={() => onModeChange(key)}>{label}</button>)}
    </nav>
    <div className="practice-desktop-controls">
      <button type="button" className="practice-auto" aria-pressed={auto} onClick={onToggleAuto} title="Tự chuyển sau khi trả lời đúng cả cụm">Tự chuyển</button>
      {assistOptions.length > 0 && <select className="practice-assist" value={assist} onChange={(event) => onAssistChange?.(Number(event.target.value))} aria-label="Tỉ lệ hỗ trợ">
        {assistOptions.map((value) => <option key={value} value={value}>{value}%</option>)}
      </select>}
      <span className="practice-timer">{elapsed}</span>
    </div>
    <PracticeMobileMenu modes={modes} activeMode={activeMode} auto={auto} onToggleAuto={onToggleAuto} onModeChange={onModeChange} onAssistChange={onAssistChange} assist={assist} assistOptions={assistOptions} elapsed={elapsed} modeHref={(nextMode) => `${base}/practice?part=${partId}&level=${level}&mode=${nextMode}`} assistHref={(value) => `${base}/practice?part=${partId}&level=${level}&assist=${value}`} />
  </header>;
}
