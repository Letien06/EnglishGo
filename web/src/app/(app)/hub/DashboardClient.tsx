"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import useDialogFocus from "@/components/useDialogFocus";
import { GOAL_KEYS, isDashboardDate, type DashboardPeriod, type DashboardPreferences, type DashboardStats, type DashboardView, type GoalKey } from "@/lib/dashboard-model";
import { DashboardIcon, StudyCompanion } from "./DashboardArt";
import styles from "./dashboard.module.css";
import CompanionEncouragement from "./CompanionEncouragement";

const skills: Record<GoalKey, { label: string; unit: string; href: string; max: number; color: string }> = {
  reading: { label: "Đọc", unit: "câu", href: "/read", max: 200, color: "#52cdb0" },
  listening: { label: "Nghe", unit: "câu", href: "/listen", max: 200, color: "#89baff" },
  vocab: { label: "Từ vựng", unit: "từ", href: "/vocab", max: 400, color: "#f4c56a" },
  practice: { label: "Luyện đề", unit: "câu", href: "/practice", max: 1000, color: "#66aaff" },
  video: { label: "Video", unit: "bài", href: "/listen/dictation", max: 20, color: "#c4a1ff" },
};
const periods: [DashboardPeriod, string][] = [["today", "Hôm nay"], ["week", "Tuần"], ["month", "Tháng"], ["all", "Tất cả"], ["custom", "Tùy chỉnh"]];
type MetricKey = "reading" | "listening" | "practice" | "vocab" | "writing" | "video" | "studySeconds" | "speaking";
const cards: { key: MetricKey; label: string; unit: string; color: string; href?: string; detail: string }[] = [
  { key: "studySeconds", label: "Thời gian học", unit: "", color: "#66aaff", detail: "Tổng thời gian làm câu nghe, đọc, đề thi, viết và trò chơi từ vựng đã được lưu. Chỉ tính các hoạt động có ghi nhận thời gian." },
  { key: "practice", label: "Luyện đề", unit: "câu", color: "#66aaff", href: "/practice", detail: "Số câu đã làm trong những đề thi và bài luyện Part đã nộp ở khoảng thời gian này." },
  { key: "reading", label: "Đọc", unit: "câu", color: "#52cdb0", href: "/read", detail: "Số lượt trả lời câu hỏi đọc đã lưu. Làm lại câu hỏi cũng được tính là một lượt luyện tập." },
  { key: "listening", label: "Nghe", unit: "câu", color: "#89baff", href: "/listen", detail: "Số lượt trả lời câu hỏi nghe đã lưu. Bài video chép chính tả được tính riêng ở mục Video." },
  { key: "speaking", label: "Nói", unit: "lượt nói", color: "#89baff", detail: "EnglishGo hiện chưa có phần luyện nói để ghi nhận hoạt động này." },
  { key: "writing", label: "Viết", unit: "bài viết", color: "#52cdb0", href: "/writing", detail: "Số bài viết đã nộp và nhận kết quả chấm trong khoảng thời gian này." },
  { key: "vocab", label: "Từ vựng", unit: "từ học/ôn", color: "#f4c56a", href: "/vocab", detail: "Số lượt học hoặc ôn từ đã lưu. Ôn lại một từ ở buổi khác vẫn được tính là một lượt học." },
  { key: "video", label: "Video", unit: "bài", color: "#f4c56a", href: "/listen/dictation", detail: "Số bài video chép chính tả đã hoàn thành và lưu kết quả." },
];

function Ring({ percent, children, color = "var(--dash-blue)" }: { percent: number; children?: ReactNode; color?: string }) {
  return <div className={styles.ring} style={{ "--ring-color": color } as CSSProperties}>
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle className={styles.ringTrack} cx="60" cy="60" r="52" /><circle className={styles.ringFill} cx="60" cy="60" r="52" pathLength="100" strokeDasharray={`${Math.min(100, Math.max(0, percent))} 100`} /></svg>
    <div className={styles.ringContent}>{children}</div>
  </div>;
}

function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(true, () => { if (!busy) onClose(); }, ref);
  return createPortal(<div className={styles.overlay} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={ref} className={`${styles.dashboard} ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="dashboard-dialog-title" tabIndex={-1}>
      <header className={styles.modalHeader}><h2 id="dashboard-dialog-title">{title}</h2><button data-dialog-initial-focus type="button" className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="Đóng"><DashboardIcon name="close" /></button></header>
      {children}
    </div>
  </div>, document.body);
}

async function apiData<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (init?.signal?.aborted) abort();
  init?.signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json();
    if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || "Không thể kết nối. Vui lòng thử lại.");
    return payload.data as T;
  } catch (error) {
    if (timedOut) throw new Error("Kết nối mất quá lâu, chưa xác nhận được kết quả. Vui lòng thử lại.");
    throw error;
  } finally {
    window.clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abort);
  }
}

function timeLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (seconds > 0 && minutes === 0) return "<1 phút";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} phút`;
}
function displayDate(date: string) { return date.split("-").reverse().join("/"); }

export default function DashboardClient({ initial }: { initial: DashboardView }) {
  const [preferences, setPreferences] = useState(initial.preferences);
  const [scoreDraft, setScoreDraft] = useState({ currentScore: initial.preferences.currentScore, targetScore: initial.preferences.targetScore });
  const [scoreStatus, setScoreStatus] = useState("");
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [stats, setStats] = useState<DashboardStats | null>({ metrics: initial.stats, start: initial.todayDateKey, end: initial.todayDateKey });
  const [loading, setLoading] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const [range, setRange] = useState({ start: initial.todayDateKey, end: initial.todayDateKey });
  const [appliedRange, setAppliedRange] = useState(range);
  const [modal, setModal] = useState<"goals" | "exam" | "range" | MetricKey | null>(null);
  const [goalsDraft, setGoalsDraft] = useState(initial.preferences.dailyGoals);
  const [examDraft, setExamDraft] = useState(initial.preferences.examDate || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const rangesCache = useRef(new Map<string, DashboardStats>([["today", { metrics: initial.stats, start: initial.todayDateKey, end: initial.todayDateKey }]]));
  useEffect(() => () => requestRef.current?.abort(), []);

  async function loadRange(next: DashboardPeriod, custom = appliedRange, force = false) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPeriod(next);
    setRangeError("");
    const key = next === "custom" ? `${next}:${custom.start}:${custom.end}` : next;
    const cached = rangesCache.current.get(key);
    if (cached && !force) { setStats(cached); setLoading(false); return; }
    setLoading(true);
    const query = new URLSearchParams({ period: next, ...(next === "custom" ? custom : {}) });
    try {
      const result = await apiData<DashboardStats>(`/api/dashboard/stats?${query}`, { signal: controller.signal, cache: "no-store" });
      if (controller.signal.aborted) return;
      rangesCache.current.set(key, result);
      setStats(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      setStats(null);
      setRangeError(error instanceof Error ? error.message : "Không tải được thống kê.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function savePreferences(patch: Partial<DashboardPreferences>, close = true) {
    setSaving(true); setSaveError(""); setScoreStatus("");
    try {
      const saved = await apiData<DashboardPreferences>("/api/dashboard/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      setPreferences(saved); setScoreDraft({ currentScore: saved.currentScore, targetScore: saved.targetScore });
      if (close) setModal(null);
      setNotice("Đã lưu cài đặt của bạn.");
      if (!close) setScoreStatus("Đã lưu điểm");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chưa lưu được. Vui lòng thử lại.";
      setSaveError(message); if (!close) setScoreStatus(message);
    } finally { setSaving(false); }
  }
  function openModal(next: "goals" | "exam" | "range" | MetricKey) {
    setSaveError(""); setNotice("");
    setGoalsDraft(structuredClone(preferences.dailyGoals)); setExamDraft(preferences.examDate || ""); setModal(next);
    if (next === "range") setRange(appliedRange);
  }
  const enabled = GOAL_KEYS.filter(key => preferences.dailyGoals[key].enabled);
  const completed = enabled.filter(key => initial.today[key] != null && initial.today[key]! >= preferences.dailyGoals[key].target).length;
  const current = preferences.currentScore;
  const remaining = current == null ? null : Math.max(0, preferences.targetScore - current);
  const daysToExam = preferences.examDate ? Math.round((Date.parse(`${preferences.examDate}T00:00:00Z`) - Date.parse(`${initial.todayDateKey}T00:00:00Z`)) / 86400000) : null;
  const scoreDirty = scoreDraft.currentScore !== preferences.currentScore || scoreDraft.targetScore !== preferences.targetScore;
  const periodLabel = periods.find(([key]) => key === period)![1];
  const metricModal = cards.find(card => card.key === modal);

  return <main className={`${styles.dashboard} ${styles.page} flex-1 overflow-y-auto`}>
    <div className={styles.container}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}><span className={styles.eyebrow}>✦ ENGLISHGO CÙNG BẠN</span><h1><span className={styles.heroName}>{initial.greetingName},</span>luyện tiếp thôi!</h1><p>Mỗi ngày một chút, tiến gần hơn đến điểm số bạn mong muốn.</p></div>
        <div className={styles.companion}><StudyCompanion /></div>
        <CompanionEncouragement />
      </section>

      <section className={styles.overview} aria-label="Mục tiêu TOEIC và động lực học">
        <article className={styles.overviewCard}><h2>Điểm số của bạn</h2>
          <form onSubmit={event => { event.preventDefault(); void savePreferences(scoreDraft, false); }}>
            {(["currentScore", "targetScore"] as const).map(key => <div key={key} className={styles.scoreGroup}>
              <label htmlFor={key}>{key === "currentScore" ? "Điểm thi thử hiện tại" : "Điểm mục tiêu"}</label>
              <div className={`${styles.scoreControl} ${key === "targetScore" ? styles.scoreTarget : ""}`}>
                <button type="button" aria-label={`Giảm ${key === "currentScore" ? "điểm hiện tại" : "điểm mục tiêu"}`} disabled={saving || (scoreDraft[key] ?? 0) <= 0} onClick={() => setScoreDraft(previous => ({ ...previous, [key]: Math.max(0, (previous[key] ?? 0) - 5) }))}>−</button>
                <input id={key} type="number" min="0" max="990" step="5" required={key === "targetScore"} placeholder="—" value={scoreDraft[key] ?? ""} disabled={saving} onChange={event => setScoreDraft(previous => ({ ...previous, [key]: event.target.value === "" ? (key === "currentScore" ? null : 0) : Number(event.target.value) }))} />
                <button type="button" aria-label={`Tăng ${key === "currentScore" ? "điểm hiện tại" : "điểm mục tiêu"}`} disabled={saving || (scoreDraft[key] ?? 0) >= 990} onClick={() => setScoreDraft(previous => ({ ...previous, [key]: Math.min(990, (previous[key] ?? 0) + 5) }))}>+</button>
              </div>
              {key === "currentScore" && <p className={styles.helper}>Nhập điểm TOEIC bạn đã thi hoặc tự đánh giá.</p>}
            </div>)}
            <div className={styles.scoreFooter}><button type="submit" className={styles.textButton} disabled={saving || !scoreDirty}>{saving && modal === null ? "Đang lưu…" : "Lưu điểm"}</button><small role="status">{scoreStatus}</small></div>
          </form>
        </article>
        <article className={`${styles.overviewCard} ${styles.scoreProgress}`}><h2>Điểm còn thiếu</h2><Ring percent={current == null ? 0 : (current / Math.max(1, preferences.targetScore)) * 100}><strong>{remaining == null ? "—" : remaining > 0 ? `+${remaining}` : "✓"}</strong><span>{remaining == null ? "Nhập điểm hiện tại" : remaining > 0 ? "điểm cần đạt thêm" : "Đã đạt mục tiêu!"}</span></Ring><p className={styles.helper}>Mục tiêu <b>{preferences.targetScore}</b> / 990 điểm</p></article>
        <article className={`${styles.overviewCard} ${styles.examCard}`}><h2>Số ngày đến ngày thi</h2><div className={styles.examContent}><span className={styles.largeIcon}><DashboardIcon name="calendar" /></span>{daysToExam == null ? <h3>Chưa đặt ngày thi</h3> : <><strong className={styles.countdown}>{Math.max(0, daysToExam)}<small>ngày</small></strong><p>{daysToExam < 0 ? "Đã qua ngày thi · " : daysToExam === 0 ? "Ngày thi hôm nay · " : "Ngày thi · "}{displayDate(preferences.examDate!)}</p></>}<button className={styles.primaryButton} onClick={() => openModal("exam")}><DashboardIcon name="calendar" />{daysToExam == null ? "Đặt ngày thi" : "Đổi ngày thi"}</button></div></article>
        <article className={styles.overviewCard}><h2>Động lực học</h2><div className={styles.motivation}><span className={`${styles.iconTile} ${styles.flame}`}><DashboardIcon name="flame" /></span><div><span>Chuỗi ngày học</span><strong className={styles.streak}>{initial.streakDays} <small>ngày</small></strong><p>Dài nhất đã ghi nhận: {initial.longestStreakDays == null ? "—" : `${initial.longestStreakDays} ngày`}</p></div></div><div className={styles.motivation}><span className={styles.iconTile}><DashboardIcon name="target" /></span><div><span>XP trọn đời</span><strong>{initial.totalXp.toLocaleString("vi-VN")} <small>XP</small></strong><p>Tích lũy từ hoạt động học</p></div></div><Link href="/leaderboard" className={styles.textButton}>Xem bảng xếp hạng <DashboardIcon name="arrow" /></Link></article>
      </section>

      <section aria-label="Thống kê học tập">
        <div className={styles.periods} role="group" aria-label="Khoảng thời gian">{periods.map(([key, label]) => <button key={key} aria-pressed={period === key} onClick={() => key === "custom" ? openModal("range") : void loadRange(key)}>{label}</button>)}</div>
        <div className={styles.rangeStatus} role="status">{loading ? "Đang tải thống kê…" : rangeError ? <>{rangeError} <button className={styles.textButton} onClick={() => void loadRange(period, appliedRange, true)}>Thử lại</button></> : period === "custom" && stats ? `${displayDate(stats.start)} – ${displayDate(stats.end)}` : stats?.metrics.measurementSince ? `Theo giờ Việt Nam · Số liệu đo lường từ ${displayDate(stats.metrics.measurementSince)}` : "Theo giờ Việt Nam · Số liệu từ các hoạt động đã lưu"}</div>
        <div className={styles.statsGrid} aria-busy={loading}>{cards.map(card => {
          const value = stats?.metrics[card.key] ?? null;
          return <button key={card.key} className={styles.statCard} onClick={() => openModal(card.key)} aria-label={`Chi tiết ${card.label}`} style={{ "--tile-color": card.color } as CSSProperties}>
            <span className={styles.iconTile}><DashboardIcon name={card.key === "studySeconds" ? "clock" : card.key} /></span>
            <div className={styles.statCopy}><h3>{card.label}</h3>{loading ? <span className={styles.numberSkeleton} /> : <strong>{value == null ? "—" : card.key === "studySeconds" ? timeLabel(value) : `${value.toLocaleString("vi-VN")} ${card.unit}`}</strong>}<p>{loading ? "Đang tải" : card.key === "speaking" ? "Chưa có hoạt động luyện nói" : value == null ? "Chưa có dữ liệu đo lường" : `${periodLabel} · ${value === 0 ? "Chưa luyện" : "Đã ghi nhận"}`}</p></div><DashboardIcon name="chevron" className={styles.chevron} />
          </button>;
        })}</div>
      </section>

      <section className={styles.goals} aria-label="Mục tiêu hôm nay">
        <div className={styles.goalsSummary}><span className={styles.eyebrow}>TỪNG BƯỚC MỖI NGÀY</span><h2>Mục tiêu hôm nay</h2><p>Những bước nhỏ tạo nên kết quả lớn.</p><div className={styles.goalCount}><strong>{completed}<span>/{enabled.length}</span></strong><span>mục tiêu hoàn thành</span></div>
          <div className={styles.miniRings}>{enabled.map(key => <div key={key}><Ring percent={((initial.today[key] ?? 0) / preferences.dailyGoals[key].target) * 100} color={skills[key].color}><DashboardIcon name={key} /></Ring><span>{skills[key].label}</span></div>)}</div>
          {!enabled.length && <p className={styles.helper}>Bật mục tiêu để xây dựng thói quen học mỗi ngày.</p>}
        </div>
        <div className={styles.goalsDetail}><h3>Hôm nay bạn sẽ…</h3><div className={styles.goalRows}>{enabled.map(key => {
          const amount = initial.today[key]; const goal = preferences.dailyGoals[key].target; const percent = Math.min(100, ((amount ?? 0) / goal) * 100);
          return <Link key={key} href={skills[key].href} className={styles.goalRow} style={{ "--goal-color": skills[key].color } as CSSProperties}><span className={styles.goalIcon}><DashboardIcon name={key} /></span><div><div className={styles.goalRowHeading}><strong>{skills[key].label}</strong><span>{amount ?? "—"}/{goal} {skills[key].unit}</span></div><div role="progressbar" aria-label={`Mục tiêu ${skills[key].label}`} aria-valuemin={0} aria-valuemax={goal} {...(amount != null ? { "aria-valuenow": Math.min(amount, goal) } : { "aria-valuetext": "Chưa có dữ liệu đo lường" })} className={styles.progressTrack}><span style={{ width: `${percent}%` }} /></div></div><DashboardIcon name={percent >= 100 ? "check" : "arrow"} className={styles.goalArrow} /></Link>;
        })}</div><button className={styles.settingsButton} onClick={() => openModal("goals")}><DashboardIcon name="settings" />Cài đặt mục tiêu hằng ngày</button></div>
      </section>
      <p className={styles.notice} role="status">{notice}</p>
    </div>

    {modal === "goals" && <Modal title="Cài đặt mục tiêu hằng ngày" busy={saving} onClose={() => setModal(null)}><form onSubmit={event => { event.preventDefault(); void savePreferences({ dailyGoals: goalsDraft }); }}><div className={styles.modalBody}><p className={styles.modalIntro}>Chọn mục tiêu vừa sức. Bạn có thể thay đổi bất cứ lúc nào.</p>{GOAL_KEYS.map(key => <div className={styles.goalSetting} key={key}><div className={styles.settingHeading}><span style={{ color: skills[key].color }}><DashboardIcon name={key} /></span><h3>{skills[key].label}</h3><label className={styles.switch}><input type="checkbox" aria-label={`Bật mục tiêu ${skills[key].label}`} checked={goalsDraft[key].enabled} disabled={saving} onChange={event => setGoalsDraft(previous => ({ ...previous, [key]: { ...previous[key], enabled: event.target.checked, target: Number.isInteger(previous[key].target) && previous[key].target >= 1 && previous[key].target <= skills[key].max ? previous[key].target : preferences.dailyGoals[key].target } }))} /><span /></label></div><label className={styles.targetLabel} htmlFor={`goal-${key}`}>Số {skills[key].unit} mỗi ngày</label><input id={`goal-${key}`} type="number" min={1} max={skills[key].max} step={1} required disabled={!goalsDraft[key].enabled || saving} value={goalsDraft[key].target || ""} onChange={event => setGoalsDraft(previous => ({ ...previous, [key]: { ...previous[key], target: Number(event.target.value) } }))} /><small>Từ 1 đến {skills[key].max} {skills[key].unit}{key === "video" ? " · Video chép chính tả" : ""}</small></div>)}<p className={styles.helper}>Thống kê chi tiết được ghi nhận từ khi tính năng này được cập nhật. Hoạt động cũ vẫn giữ XP và chuỗi ngày học.</p>{saveError && <p role="alert" className={styles.error}>{saveError}</p>}</div><footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => setModal(null)}>Hủy</button><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? "Đang lưu…" : "Lưu mục tiêu"}</button></footer></form></Modal>}
    {modal === "exam" && <Modal title="Đặt ngày thi TOEIC" busy={saving} onClose={() => setModal(null)}><form onSubmit={event => { event.preventDefault(); void savePreferences({ examDate: examDraft }); }}><div className={styles.modalBody}><p className={styles.modalIntro}>Có một cột mốc rõ ràng sẽ giúp bạn giữ nhịp học mỗi ngày.</p><label htmlFor="exam-date">Ngày thi dự kiến</label><input id="exam-date" type="date" min={initial.todayDateKey} max="2100-12-31" required value={examDraft} disabled={saving} onChange={event => setExamDraft(event.target.value)} />{saveError && <p role="alert" className={styles.error}>{saveError}</p>}</div><footer className={styles.modalFooter}>{preferences.examDate && <button type="button" className={styles.textButton} disabled={saving} onClick={() => void savePreferences({ examDate: null })}>Xóa ngày thi</button>}<button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? "Đang lưu…" : "Lưu ngày thi"}</button></footer></form></Modal>}
    {modal === "range" && <Modal title="Khoảng thời gian tùy chỉnh" onClose={() => setModal(null)}><form onSubmit={event => { event.preventDefault(); if (!isDashboardDate(range.start) || !isDashboardDate(range.end) || range.start > range.end || range.end > initial.todayDateKey) { setSaveError("Chọn ngày bắt đầu trước ngày kết thúc và không sau hôm nay."); return; } setAppliedRange(range); setModal(null); void loadRange("custom", range); }}><div className={styles.modalBody}>{(["start", "end"] as const).map(key => <div key={key}><label htmlFor={`range-${key}`}>{key === "start" ? "Từ ngày" : "Đến ngày"}</label><input id={`range-${key}`} type="date" max={initial.todayDateKey} required value={range[key]} onChange={event => setRange(previous => ({ ...previous, [key]: event.target.value }))} /></div>)}{saveError && <p role="alert" className={styles.error}>{saveError}</p>}</div><footer className={styles.modalFooter}><button className={styles.primaryButton} type="submit">Xem thống kê</button></footer></form></Modal>}
    {metricModal && <Modal title={metricModal.label} onClose={() => setModal(null)}><div className={styles.modalBody}><p className={styles.detailValue}>{loading ? "Đang tải…" : stats?.metrics[metricModal.key] == null ? "Chưa có dữ liệu" : metricModal.key === "studySeconds" ? timeLabel(stats.metrics.studySeconds!) : `${stats.metrics[metricModal.key]} ${metricModal.unit}`}</p><p className={styles.modalIntro}>{metricModal.detail}</p>{stats && <p className={styles.helper}>{period === "all" ? "Toàn bộ thời gian" : `${displayDate(stats.start)} – ${displayDate(stats.end)}`}</p>}{metricModal.key !== "speaking" && <p className={styles.helper}>Chỉ tính dữ liệu đo lường đã ghi nhận từ bản cập nhật này; hoạt động cũ vẫn giữ XP và chuỗi học.</p>}</div>{metricModal.href && <footer className={styles.modalFooter}><Link className={styles.primaryButton} href={metricModal.href}>Luyện {metricModal.label.toLowerCase()} <DashboardIcon name="arrow" /></Link></footer>}</Modal>}
  </main>;
}
