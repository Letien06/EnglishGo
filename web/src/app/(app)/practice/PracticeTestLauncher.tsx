"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PracticeTestCard } from "@/lib/services/practice";
import useDialogFocus from "@/components/useDialogFocus";
import { formatPracticeLabel } from "@/lib/practice-label";
import { practiceDraftKey } from "@/lib/practice-draft-storage";

const PARTS = [
  { part: 1, label: "Part 1", group: "LISTENING", questions: 6, minutes: 4 },
  { part: 2, label: "Part 2", group: "LISTENING", questions: 25, minutes: 15 },
  { part: 3, label: "Part 3", group: "LISTENING", questions: 39, minutes: 25 },
  { part: 4, label: "Part 4", group: "LISTENING", questions: 30, minutes: 20 },
  { part: 5, label: "Part 5", group: "READING", questions: 30, minutes: 18 },
  { part: 6, label: "Part 6", group: "READING", questions: 16, minutes: 10 },
  { part: 7, label: "Part 7", group: "READING", questions: 54, minutes: 42 },
] as const;

const ALL_PARTS = PARTS.map((item) => item.part);
const FULL_TEST_MINUTES = 120;

interface Props {
  tests: PracticeTestCard[];
  userUid: string | null;
}

type ModalTab = "exam" | "practice";

export default function PracticeTestLauncher({ tests, userUid }: Props) {
  const router = useRouter();
  const [selectedTest, setSelectedTest] = useState<PracticeTestCard | null>(null);
  const [tab, setTab] = useState<ModalTab>("exam");
  const [selectedParts, setSelectedParts] = useState<number[]>(ALL_PARTS);
  const [durationMinutes, setDurationMinutes] = useState(FULL_TEST_MINUTES);
  const [startingLabel, setStartingLabel] = useState("");
  const lastWarmupKey = useRef("");
  const modalRef = useRef<HTMLElement>(null);

  function openModal(test: PracticeTestCard, nextTab: ModalTab) {
    setSelectedTest(test);
    setTab(nextTab);
    if (nextTab === "exam") {
      setSelectedParts(ALL_PARTS);
      setDurationMinutes(FULL_TEST_MINUTES);
    } else {
      setSelectedParts([5]);
      setDurationMinutes(suggestedMinutes([5]));
    }
  }

  function closeModal() {
    setSelectedTest(null);
  }

  useDialogFocus(Boolean(selectedTest), closeModal, modalRef);

  function chooseFullTest() {
    setTab("exam");
    setSelectedParts(ALL_PARTS);
    setDurationMinutes(FULL_TEST_MINUTES);
  }

  function chooseAllParts() {
    setSelectedParts(ALL_PARTS);
    setDurationMinutes(FULL_TEST_MINUTES);
  }

  function togglePart(part: number) {
    setTab("practice");
    setSelectedParts((current) => {
      const next = current.includes(part)
        ? current.filter((item) => item !== part)
        : [...current, part].sort((a, b) => a - b);
      if (next.length > 0) setDurationMinutes(suggestedMinutes(next));
      return next;
    });
  }

  function resetParts() {
    setTab("practice");
    setSelectedParts([]);
    setDurationMinutes(suggestedMinutes([5]));
  }

  const totalQuestions = useMemo(
    () => selectedParts.reduce((total, part) => total + (PARTS.find((item) => item.part === part)?.questions ?? 0), 0),
    [selectedParts],
  );
  const validDuration = Number.isFinite(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 180;
  const allPartsSelected = selectedParts.length === ALL_PARTS.length;
  const startDisabled = !selectedTest || selectedParts.length === 0 || !validDuration;
  const currentMode = allPartsSelected ? "exam" : "part";
  const currentSessionKey = selectedTest && !startDisabled
    ? makeSessionKey(selectedTest.id, currentMode, selectedParts, durationMinutes)
    : "";
  const selectedPartsKey = selectedParts.join(",");
  const hasLocalDraft = useMemo(() => {
    if (!userUid || !currentSessionKey || typeof window === "undefined") return false;
    try { return window.localStorage.getItem(practiceDraftKey(userUid, currentSessionKey)) != null; } catch { return false; }
  }, [currentSessionKey, userUid]);
  const warning = validDuration && totalQuestions > 0 && durationMinutes < Math.max(1, Math.round(totalQuestions / 3))
    ? `Thời gian khá ngắn cho ${totalQuestions} câu.`
    : "";

  useEffect(() => {
    if (!selectedTest || startDisabled) return;
    const warmupKey = `${selectedTest.id}:${currentMode}:${selectedPartsKey}:${durationMinutes}`;
    if (lastWarmupKey.current === warmupKey) return;
    lastWarmupKey.current = warmupKey;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/practice/tests/${selectedTest.id}/warmup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: currentMode,
          parts: selectedParts,
          durationMinutes,
        }),
        signal: controller.signal,
      }).catch(() => undefined);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentMode, durationMinutes, selectedParts, selectedPartsKey, selectedTest, startDisabled]);

  function start(resetDraft = false) {
    if (!selectedTest || startDisabled || startingLabel) return;
    const nextHref = sessionHref(selectedTest.id, currentMode, selectedParts, durationMinutes);
    setStartingLabel(resetDraft ? "Đang tạo lại bài thi..." : "Đang mở bài thi...");
    if (resetDraft) {
      if (currentSessionKey && userUid) {
        try { window.localStorage.removeItem(practiceDraftKey(userUid, currentSessionKey)); } catch { /* Server reset still proceeds. */ }
      }
      router.push(`${nextHref}&reset=1`);
      return;
    }
    router.push(nextHref);
  }

  return (
    <>
      <div className="practice-test-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tests.map((test) => (
          <article key={test.id} className="premium-card premium-card--interactive practice-test-card p-5">
            <header className="space-y-1">
              <h2 className="font-bold text-ink">{formatPracticeLabel(test.title)}</h2>
              <p className="text-xs text-muted">
                {formatPracticeLabel(test.type)} · {test.difficulty == null ? "Mọi mức độ" : `Độ khó ${test.difficulty}`}
              </p>
            </header>
            <div className="mt-4 flex gap-3 text-sm text-muted">
              <span>{test.totalQuestions} câu</span>
              <span>{test.duration} phút</span>
            </div>
            <p className="mt-3 text-sm text-muted">Chưa luyện tập</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => openModal(test, "exam")}
                className="premium-primary flex-1 px-4 py-2 text-sm"
              >
                Thi thử
              </button>
              <button
                type="button"
                onClick={() => openModal(test, "practice")}
                className="premium-secondary flex-1 px-4 py-2 text-sm"
              >
                Luyện tập
              </button>
              <Link
                href="/practice/history"
                className="premium-secondary px-4 py-2 text-sm"
              >
                Lịch sử
              </Link>
            </div>
          </article>
        ))}
      </div>

      {startingLabel ? <PracticeBusyOverlay title={startingLabel} description="Đang tải dữ liệu đề, audio và ảnh..." /> : null}

      {selectedTest ? (
        <div className="practice-launcher-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng chọn chế độ" onClick={closeModal} />
          <section ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="practice-launcher-title" className="practice-launcher-dialog relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 id="practice-launcher-title" className="text-xl font-extrabold text-ink">Chọn chế độ</h2>
                <p className="mt-1 text-sm text-muted">{formatPracticeLabel(selectedTest.title)}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xl text-muted hover:bg-surface-soft"
                aria-label="Đóng"
              >
                ×
              </button>
            </header>

            <div className="practice-mode-switch mt-5 grid grid-cols-2 rounded-xl bg-surface-soft p-1">
              <button
                type="button"
                onClick={chooseFullTest}
                className={`rounded-lg px-4 py-2 text-sm font-extrabold ${tab === "exam" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
              >
                Luyện thi
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("practice");
                  if (selectedParts.length === ALL_PARTS.length) {
                    setSelectedParts([5]);
                    setDurationMinutes(suggestedMinutes([5]));
                  }
                }}
                className={`rounded-lg px-4 py-2 text-sm font-extrabold ${tab === "practice" ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
              >
                Luyện tập
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <article className={`practice-choice-card rounded-xl border p-4 ${allPartsSelected && tab === "exam" ? "border-accent bg-accent/5" : "border-line bg-surface"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={chooseFullTest} className="text-left">
                    <strong className="text-ink">Full Test (200 câu)</strong>
                    <p className="mt-1 text-sm text-muted">Làm đầy đủ đề thi như thi thật.</p>
                    <span className="mt-3 inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                      120 phút · 200 câu
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={chooseFullTest}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-extrabold text-gold-ink"
                  >
                    Chọn full
                  </button>
                </div>
              </article>

              <article className="practice-choice-card rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong className="text-ink">Thi theo Part</strong>
                    <p className="mt-1 text-sm text-muted">Chọn một hoặc nhiều part để thi thử.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={chooseAllParts} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink">
                      Chọn tất cả
                    </button>
                    <button type="button" onClick={resetParts} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-muted">
                      Đặt lại
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <PartGroup title="LISTENING" parts={PARTS.filter((part) => part.group === "LISTENING")} selectedParts={selectedParts} onToggle={togglePart} />
                  <PartGroup title="READING" parts={PARTS.filter((part) => part.group === "READING")} selectedParts={selectedParts} onToggle={togglePart} />
                </div>
              </article>

              <article className="practice-choice-card rounded-xl border border-line bg-surface p-4">
                <label className="text-sm font-extrabold text-ink" htmlFor="practice-duration">
                  Thời gian làm bài
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    id="practice-duration"
                    type="number"
                    min={1}
                    max={180}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(Number(event.target.value))}
                    className="w-32 rounded-lg border border-line bg-surface-soft px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                  <span className="text-sm text-muted">phút</span>
                  {[15, 30, 60, 120].map((minutes) => (
                    <button key={minutes} type="button" onClick={() => setDurationMinutes(minutes)} className="rounded-full border border-line px-3 py-1 text-xs font-bold text-ink">
                      {minutes} phút
                    </button>
                  ))}
                  <button type="button" onClick={() => setDurationMinutes(suggestedMinutes(selectedParts))} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                    Gợi ý
                  </button>
                </div>
                <div className="mt-3 text-sm">
                  <span className="font-bold text-ink">{totalQuestions}</span>
                  <span className="text-muted"> câu · </span>
                  <span className="font-bold text-ink">{selectedParts.length ? selectedParts.map((part) => `Part ${part}`).join(", ") : "Chưa chọn part"}</span>
                </div>
                {!validDuration ? <p className="mt-2 text-sm font-bold text-red-600">Thời gian không hợp lệ.</p> : null}
                {warning ? <p className="mt-2 text-sm font-bold text-amber-600">{warning}</p> : null}
              </article>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeModal} className="rounded-lg border border-line px-5 py-2 text-sm font-bold text-ink">
                  Hủy
                </button>
                <button
                  type="button"
                  data-dialog-initial-focus
                  onClick={() => start(false)}
                  disabled={startDisabled || Boolean(startingLabel)}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-extrabold text-gold-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {startingLabel ? "Đang mở..." : hasLocalDraft ? "Tiếp tục bài đang làm" : "Bắt đầu"}
                </button>
                {hasLocalDraft ? (
                  <button
                    type="button"
                    onClick={() => start(true)}
                    disabled={startDisabled || Boolean(startingLabel)}
                    className="rounded-lg bg-surface-soft px-5 py-2 text-sm font-extrabold text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {startingLabel ? "Đang mở..." : "Làm lại"}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function PartGroup({
  title,
  parts,
  selectedParts,
  onToggle,
}: {
  title: string;
  parts: Array<(typeof PARTS)[number]>;
  selectedParts: number[];
  onToggle: (part: number) => void;
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-extrabold text-muted">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {parts.map((item) => {
          const selected = selectedParts.includes(item.part);
          return (
            <button
              key={item.part}
              type="button"
              onClick={() => onToggle(item.part)}
              className={`practice-part-option flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                selected ? "border-accent bg-accent/5 text-ink" : "border-line bg-surface text-muted"
              }`}
            >
              <span className="font-bold">{item.label}</span>
              <span>{item.questions} câu</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function suggestedMinutes(parts: number[]): number {
  if (parts.length === ALL_PARTS.length) return FULL_TEST_MINUTES;
  const total = parts.reduce((sum, part) => sum + (PARTS.find((item) => item.part === part)?.minutes ?? 0), 0);
  return Math.min(180, Math.max(1, total || 18));
}

function makeSessionKey(testId: number, mode: "exam" | "part", parts: number[], durationMinutes: number): string {
  return `practice-${testId}-${mode}-parts-${parts.join("-")}-time-${durationMinutes}`;
}

function sessionHref(testId: number, mode: "exam" | "part", parts: number[], durationMinutes: number): string {
  const params = new URLSearchParams({
    mode,
    parts: parts.join(","),
    time: String(durationMinutes),
  });
  return `/practice/session/${testId}?${params.toString()}`;
}

function PracticeBusyOverlay({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-busy-overlay">
      <section className="app-busy-card">
        <span className="app-busy-spinner" />
        <div>
          <h2 className="app-busy-title">{title}</h2>
          <p className="app-busy-description">{description}</p>
        </div>
      </section>
    </div>
  );
}
