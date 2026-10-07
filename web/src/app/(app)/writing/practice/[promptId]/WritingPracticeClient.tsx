"use client";

import Link from "next/link";
import WritingPracticeLoading from "./loading";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS,
  type WritingPartOneGrammarCategory,
  type WritingPrompt,
} from "@/types/writing";

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: string };
type RecordValue = Record<string, unknown>;

type FeedbackCriterion = {
  id: string;
  label: string;
  score: number | null;
  maxScore: number | null;
  note: string;
};

type FeedbackCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

type FeedbackView = {
  score: number | null;
  maxScore: number | null;
  label: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  criteria: FeedbackCriterion[];
  checks: FeedbackCheck[];
  revisedAnswer: string;
  nextAction: string;
};

type AttemptView = {
  id: string;
  responseText: string;
  submittedAtMillis: number | null;
  feedback: FeedbackView;
};

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === "object" && "data" in body) return (body as ApiEnvelope<T>).data as T;
  return body as T;
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function stringValue(record: RecordValue | null, ...keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberValue(record: RecordValue | null, ...keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [item.trim()] : [];
    const record = asRecord(item);
    const title = stringValue(record, "title");
    const sentence = stringValue(record, "message", "text", "description", "feedback", "issue", "suggestion", "explanation");
    if (title && sentence && title !== sentence) return [`${title}: ${sentence}`];
    return sentence ? [sentence] : [];
  });
}

function normalizeCriteria(value: unknown): FeedbackCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = asRecord(item);
    return {
      id: stringValue(record, "id", "criterionId", "key") || String(index),
      label: stringValue(record, "label", "criterion", "name", "title") || `Tiêu chí ${index + 1}`,
      score: numberValue(record, "score", "value", "points"),
      maxScore: numberValue(record, "maxScore", "max", "outOf"),
      note: stringValue(record, "note", "feedback", "comment", "explanation"),
    };
  });
}

function normalizeChecks(value: unknown): FeedbackCheck[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const label = stringValue(record, "label", "title", "name");
    const detail = stringValue(record, "detail", "description", "feedback", "message");
    if (!label && !detail) return [];
    return [{
      id: stringValue(record, "id", "key") || String(index),
      label: label || `Kiểm tra ${index + 1}`,
      passed: record?.passed === true,
      detail,
    }];
  });
}

function normalizeAttempt(value: unknown): AttemptView {
  const record = asRecord(value) ?? {};
  const feedbackRecord = asRecord(record.feedback) ?? record;
  const deterministicChecks = asRecord(feedbackRecord.deterministicChecks);
  const feedback: FeedbackView = {
    score: numberValue(feedbackRecord, "overallScore", "score", "estimatedScore", "totalScore"),
    maxScore: numberValue(feedbackRecord, "maxScore", "totalMaxScore", "outOf"),
    label: stringValue(feedbackRecord, "scoreLabel", "label", "level"),
    summary: stringValue(feedbackRecord, "summary", "overview", "feedback", "assessment"),
    strengths: stringList(feedbackRecord.strengths),
    improvements: stringList(feedbackRecord.improvements ?? feedbackRecord.issues ?? feedbackRecord.suggestions),
    criteria: normalizeCriteria(feedbackRecord.rubricScores ?? feedbackRecord.criteria ?? feedbackRecord.breakdown),
    checks: normalizeChecks(deterministicChecks?.checks),
    revisedAnswer: stringValue(feedbackRecord, "revisedAnswer", "improvedAnswer", "suggestedAnswer", "rewrite"),
    nextAction: stringValue(feedbackRecord, "nextAction", "nextStep", "recommendation"),
  };
  return {
    id: stringValue(record, "id", "attemptId") || `attempt-${Date.now()}`,
    responseText: stringValue(record, "responseText", "answer", "text"),
    submittedAtMillis: numberValue(record, "submittedAtMillis", "createdAtMillis", "createdAt"),
    feedback,
  };
}

function normalizePrompt(value: unknown): WritingPrompt | null {
  if (!value || typeof value !== "object") return null;
  const record = asRecord(value);
  if (record?.prompt && typeof record.prompt === "object") return record.prompt as WritingPrompt;
  return value as WritingPrompt;
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function partTitle(part: number) {
  return part === 1 ? "Part 1 · Viết câu theo tranh" : part === 2 ? "Part 2 · Trả lời email" : "Part 3 · Bài luận";
}

type PartOneStructureGuide = {
  title: string;
  formula: string;
  description: string;
  tip: string;
};

const PART_ONE_STRUCTURE_GUIDES: Record<WritingPartOneGrammarCategory, PartOneStructureGuide> = {
  N_N: {
    title: "Nối hai danh từ vào cùng một bối cảnh",
    formula: "The [noun 1] is [verb-ing] the [noun 2].",
    description: "Đặt cả hai danh từ vào một câu mô tả rõ người/vật và bối cảnh trong ảnh.",
    tip: "Thêm động từ hoặc cụm vị trí để câu hoàn chỉnh, không chỉ liệt kê hai danh từ.",
  },
  V_N: {
    title: "Diễn tả hành động và đối tượng",
    formula: "The [subject] is [verb-ing] the [noun].",
    description: "Đổi động từ sang dạng V-ing, rồi dùng danh từ làm đối tượng hoặc chi tiết chính của ảnh.",
    tip: "Ưu tiên hiện tại tiếp diễn khi nhân vật đang thực hiện hành động trong ảnh.",
  },
  N_PREP: {
    title: "Dùng danh từ để chỉ vị trí",
    formula: "The [noun] is [preposition] the [place/object].",
    description: "Kết hợp danh từ với giới từ để nêu vị trí, hướng hoặc mối quan hệ giữa các vật trong ảnh.",
    tip: "Kiểm tra sau giới từ có đủ một cụm danh từ, ví dụ: on the desk / near the door.",
  },
  V_PREP: {
    title: "Diễn tả hành động kèm giới từ",
    formula: "The [subject] is [verb-ing] [preposition] …",
    description: "Dùng động từ theo đúng cụm đi với giới từ để mô tả hành động tự nhiên trong ảnh.",
    tip: "Đổi động từ sang V-ing và giữ đúng giới từ trong cụm, ví dụ: looking at / waiting for.",
  },
};

function grammarCategoryLabel(category: WritingPrompt["part1Category"]) {
  return category ? WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS[category] : "Cấu trúc linh hoạt";
}

function planItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  if (typeof value === "string") return value.split(/\n|•/).map((item) => item.trim()).filter(Boolean);
  const record = asRecord(value);
  if (!record) return [];
  return Object.values(record).filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

export default function WritingPracticeClient({ promptId }: { promptId: string }) {
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [revealedHintCount, setRevealedHintCount] = useState(0);
  const [showSample, setShowSample] = useState(false);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const requestPrompt = useCallback(async () => {
    const response = await fetch(`/api/writing/prompts/${encodeURIComponent(promptId)}`);
    const body = await response.json() as ApiEnvelope<unknown>;
    if (!response.ok || body.success === false) throw new Error(body.error || "Không tìm thấy đề viết này.");
    const nextPrompt = normalizePrompt(unwrap(body));
    if (!nextPrompt) throw new Error("Dữ liệu đề viết chưa hợp lệ.");
    return nextPrompt;
  }, [promptId]);

  useEffect(() => {
    let cancelled = false;
    void requestPrompt()
      .then((nextPrompt) => {
        if (cancelled) return;
        setPrompt(nextPrompt);
        setAnswer("");
        setAttempt(null);
        setElapsedSeconds(0);
        setRevealedHintCount(0);
        setShowSample(false);
        setError(null);
        startedAtRef.current = Date.now();
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Không thể tải đề viết.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestPrompt]);

  async function loadPrompt() {
    setLoading(true);
    setError(null);
    try {
      const nextPrompt = await requestPrompt();
      setPrompt(nextPrompt);
      setAnswer("");
      setAttempt(null);
      setElapsedSeconds(0);
      setRevealedHintCount(0);
      setShowSample(false);
      startedAtRef.current = Date.now();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể tải đề viết.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!prompt || attempt || !startedAtRef.current) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [attempt, prompt]);

  const timeLimitSeconds = (prompt?.timeLimitMinutes ?? 0) * 60;
  const remainingSeconds = Math.max(0, timeLimitSeconds - elapsedSeconds);
  const responseWordCount = useMemo(() => wordCount(answer), [answer]);
  const visibleHints = prompt?.hints?.slice(0, revealedHintCount) ?? [];
  const usedHintLevels = visibleHints.map((hint) => hint.level);
  const outline = planItems(prompt?.planTemplate);
  const feedbackCriteria = attempt?.feedback.criteria.length ? attempt.feedback.criteria : (prompt?.rubric ?? []).map((criterion) => ({
    id: criterion.id,
    label: criterion.label,
    score: null,
    maxScore: criterion.maxScore,
    note: criterion.description,
  }));

  async function submit() {
    if (!prompt || !answer.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/writing/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: prompt.id,
          responseText: answer.trim(),
          elapsedSeconds,
          usedHintLevels,
          usedSample: showSample,
        }),
      });
      const body = await response.json() as ApiEnvelope<unknown>;
      if (!response.ok || body.success === false) throw new Error(body.error || "Không thể chấm bài lúc này.");
      setAttempt(normalizeAttempt(unwrap(body)));
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : "Không thể chấm bài lúc này.");
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    setAnswer("");
    setAttempt(null);
    setSubmitError(null);
    setElapsedSeconds(0);
    setRevealedHintCount(0);
    setShowSample(false);
    startedAtRef.current = Date.now();
  }

  if (loading) {
    return <WritingPracticeLoading />;
  }

  if (!prompt || error) {
    return <main className="app-canvas flex min-h-dvh items-center justify-center px-4 py-8"><section className="premium-card max-w-lg p-8 text-center"><p className="text-xl font-extrabold text-ink">Không mở được bài luyện</p><p className="mt-2 text-sm leading-6 text-muted">{error || "Đề viết không tồn tại hoặc đã được gỡ khỏi thư viện."}</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => void loadPrompt()} className="premium-primary rounded-xl px-4 py-2.5 text-sm font-extrabold">Tải lại</button><Link href="/writing" className="premium-secondary rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline">Về thư viện</Link></div></section></main>;
  }

  return (
    <main className="app-canvas min-h-dvh px-3 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl pb-10">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <Link href="/writing" className="premium-secondary inline-flex items-center rounded-xl px-3.5 py-2 text-sm font-extrabold no-underline">← Thư viện Writing</Link>
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-extrabold text-primary">{partTitle(prompt.part)}</span>
          {prompt.part === 1 && prompt.part1Category && (
            <span className="rounded-full border border-azure/25 bg-azure/10 px-3 py-1.5 text-xs font-extrabold text-azure2">
              Nhóm {grammarCategoryLabel(prompt.part1Category)}
            </span>
          )}
          <span className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs font-bold text-muted">{{ BEGINNER: "Cơ bản", INTERMEDIATE: "Trung cấp", ADVANCED: "Nâng cao" }[prompt.difficulty]}</span>
          <div className="ml-auto flex items-center gap-2 rounded-xl border border-line bg-surface/80 px-3 py-2 shadow-sm">
            <span className="text-xs font-bold text-muted">Thời gian</span>
            <strong className={`font-mono text-base font-extrabold ${remainingSeconds === 0 ? "text-terracotta" : "text-ink"}`}>{formatDuration(remainingSeconds)}</strong>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
          <section className="space-y-5">
            <article className="premium-card overflow-hidden">
              <div className="border-b border-line px-5 py-4 sm:px-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Đề bài</p>
                <h1 className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">{prompt.title}</h1>
                {prompt.titleVi && <p className="mt-1 text-sm font-semibold text-ink2">{prompt.titleVi}</p>}
              </div>
              {prompt.part === 1 && <PictureTask prompt={prompt} />}
              {prompt.part === 2 && <EmailTask prompt={prompt} />}
              {prompt.part === 3 && <EssayTask prompt={prompt} outline={outline} />}
              <div className="border-t border-line bg-surface-soft/60 px-5 py-4 sm:px-6">
                <p className="text-sm leading-6 text-ink2">{prompt.instructions}</p>
              </div>
            </article>

            {prompt.rubric?.length > 0 && (
              <article className="premium-card p-5 sm:p-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Cách chấm của bài này</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {prompt.rubric.map((criterion) => <div key={criterion.id} className="rounded-xl border border-line bg-surface-soft/55 p-3"><div className="flex items-start justify-between gap-3"><strong className="text-sm text-ink">{criterion.label}</strong><span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-extrabold text-primary">{criterion.maxScore}đ</span></div><p className="mt-1 text-xs leading-5 text-muted">{criterion.description}</p></div>)}
                </div>
              </article>
            )}
          </section>

          <section className="space-y-5">
            <article className="premium-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Bài làm của bạn</p>
                  <p className="mt-1 text-sm text-muted">Viết tự nhiên trước, rồi dùng gợi ý khi thật sự cần.</p>
                </div>
                <span className="rounded-lg bg-surface-soft px-2.5 py-1.5 text-xs font-extrabold text-ink2">{responseWordCount} từ</span>
              </div>
              <label className="mt-4 block">
                <span className="sr-only">Nhập bài viết bằng tiếng Anh</span>
                <textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  disabled={Boolean(attempt)}
                  placeholder={placeholderForPart(prompt.part)}
                  rows={prompt.part === 3 ? 15 : 10}
                  className="min-h-64 w-full resize-y p-4 text-[15px] leading-7 disabled:cursor-not-allowed disabled:opacity-75"
                />
              </label>
              {remainingSeconds === 0 && !attempt && <p className="mt-2 text-xs font-bold text-terracotta">Hết thời gian gợi ý. Bạn vẫn có thể nộp bài để nhận phản hồi.</p>}
              {submitError && <p className="mt-3 rounded-xl border border-crimson/25 bg-crimson/10 px-3 py-2 text-sm font-semibold text-crimson2" role="alert">{submitError}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-xs text-xs leading-5 text-muted"><p>{responseRuleLabel(prompt)}</p>{prompt.responseRules.minWords && responseWordCount < prompt.responseRules.minWords && <p className="mt-1 font-bold text-terracotta">Còn thiếu khoảng {prompt.responseRules.minWords - responseWordCount} từ so với mức tối thiểu.</p>}</div>
                {!attempt ? <button type="button" disabled={!answer.trim() || submitting} onClick={() => void submit()} className="premium-primary inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "AI đang chấm..." : "✦ Chấm bài với AI"}</button> : <button type="button" onClick={retry} className="premium-secondary rounded-xl px-4 py-2.5 text-sm font-extrabold">↻ Viết lại</button>}
              </div>
            </article>

            {!attempt && <StudySupport prompt={prompt} visibleHints={visibleHints} revealedHintCount={revealedHintCount} showSample={showSample} onRevealHint={() => setRevealedHintCount((count) => Math.min(count + 1, prompt.hints.length))} onToggleSample={() => setShowSample((value) => !value)} />}
            {attempt && (
              <>
                <FeedbackPanel attempt={attempt} fallbackCriteria={feedbackCriteria} />
                {prompt.part === 1 && <PartOneCompletionNav prompt={prompt} attempt={attempt} />}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function PictureTask({ prompt }: { prompt: WritingPrompt }) {
  const guide = prompt.part1Category ? PART_ONE_STRUCTURE_GUIDES[prompt.part1Category] : null;

  return (
    <div className="p-5 sm:p-6">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-soft">
        <div
          className="relative aspect-[4/3] bg-surface-soft bg-cover bg-center"
          role="img"
          aria-label={prompt.imageAlt || prompt.title}
          style={prompt.imageUrl ? { backgroundImage: `url("${prompt.imageUrl}")` } : undefined}
        >
          {!prompt.imageUrl && <div className="flex h-full items-center justify-center text-7xl text-primary" aria-hidden="true">▧</div>}
          <span className="absolute left-3 top-3 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
            Quan sát kỹ người, hành động và bối cảnh
          </span>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-extrabold text-ink">Dùng cả hai từ / cụm từ sau trong một câu:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {prompt.requiredTerms.map((term) => (
            <span key={term} className="rounded-full border border-azure/25 bg-azure/10 px-3 py-1.5 text-sm font-extrabold text-azure2">
              {term}
            </span>
          ))}
        </div>
      </div>

      {guide && (
        <section className="mt-5 rounded-2xl border border-primary/20 bg-primary/10 p-4" aria-label={`Hướng dẫn nhóm ${grammarCategoryLabel(prompt.part1Category)}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Nhóm cấu trúc đang luyện</p>
              <h2 className="mt-1 text-base font-extrabold text-ink">{guide.title}</h2>
            </div>
            <span className="rounded-full border border-primary/20 bg-surface px-2.5 py-1 text-xs font-extrabold text-primary">
              {grammarCategoryLabel(prompt.part1Category)}
            </span>
          </div>
          <code className="mt-4 block rounded-xl border border-primary/15 bg-surface/90 px-3 py-2.5 font-mono text-xs font-bold leading-6 text-ink2 sm:text-sm">
            {guide.formula}
          </code>
          <p className="mt-3 text-sm leading-6 text-ink2">{guide.description}</p>
          <p className="mt-2 rounded-lg bg-surface/70 px-3 py-2 text-xs leading-5 text-muted">
            <strong className="text-ink2">Mẹo:</strong> {guide.tip}
          </p>
        </section>
      )}
    </div>
  );
}

function EmailTask({ prompt }: { prompt: WritingPrompt }) {
  return (
    <div className="p-5 sm:p-6">
      <div className="rounded-2xl border border-line bg-surface-soft/55 p-5">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-plum/15 text-lg text-plum" aria-hidden="true">✉</span>
          <div><p className="text-xs font-extrabold uppercase tracking-wide text-muted">Email scenario</p><p className="font-extrabold text-ink">{prompt.summary}</p></div>
        </div>
        {prompt.email && <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm leading-6 text-ink2"><dl className="grid gap-1"><EmailField label="From" value={prompt.email.fromName} /><EmailField label="To" value={prompt.email.toName} /><EmailField label="Subject" value={prompt.email.subject} /></dl>{prompt.email.body && <p className="mt-4 whitespace-pre-wrap border-y border-line py-4">{prompt.email.body}</p>}{prompt.email.signature && <p className="mt-4 whitespace-pre-wrap">{prompt.email.signature}</p>}</div>}
        <div className="mt-5"><p className="text-sm font-extrabold text-ink">Bài trả lời cần bao quát:</p><ul className="mt-3 space-y-2">{prompt.taskChecklist.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-ink2"><span className="mt-0.5 text-jade" aria-hidden="true">✓</span><span>{item}</span></li>)}</ul></div>
      </div>
    </div>
  );
}

function EmailField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2"><dt className="font-extrabold text-muted">{label}</dt><dd className="min-w-0 font-semibold text-ink">{value}</dd></div>;
}

function EssayTask({ prompt, outline }: { prompt: WritingPrompt; outline: string[] }) {
  return <div className="p-5 sm:p-6"><div className="rounded-2xl border border-primary/20 bg-primary/10 p-5"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Opinion question</p><p className="mt-3 text-lg font-extrabold leading-8 text-ink">{prompt.promptText || prompt.summary}</p></div>{outline.length > 0 && <div className="mt-5"><p className="text-sm font-extrabold text-ink">Khung lập luận gợi ý</p><ol className="mt-3 space-y-2">{outline.map((item, index) => <li key={`${index}-${item}`} className="flex gap-3 rounded-xl border border-line bg-surface-soft/55 px-3 py-2.5 text-sm leading-6 text-ink2"><span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">{index + 1}</span>{item}</li>)}</ol></div>}</div>;
}

function StudySupport({ prompt, visibleHints, revealedHintCount, showSample, onRevealHint, onToggleSample }: { prompt: WritingPrompt; visibleHints: WritingPrompt["hints"]; revealedHintCount: number; showSample: boolean; onRevealHint: () => void; onToggleSample: () => void }) {
  const hasAnotherHint = revealedHintCount < prompt.hints.length;
  return <article className="premium-card p-4 sm:p-5"><div className="flex flex-wrap gap-2"><button type="button" onClick={onRevealHint} disabled={!hasAnotherHint} className="premium-secondary rounded-xl px-3.5 py-2 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-45">{hasAnotherHint ? `Gợi ý ${revealedHintCount + 1}/${prompt.hints.length}` : "Đã mở hết gợi ý"}</button><button type="button" onClick={onToggleSample} className={`rounded-xl border px-3.5 py-2 text-sm font-extrabold ${showSample ? "border-primary bg-primary/10 text-primary" : "border-line bg-surface text-ink"}`}>{showSample ? "Ẩn câu mẫu" : "Xem câu mẫu"}</button></div>{visibleHints.length > 0 && <div className="mt-4 space-y-3">{visibleHints.map((hint) => <div key={hint.level} className="rounded-xl border border-azure/20 bg-azure/10 p-3"><p className="text-sm font-extrabold text-azure2">Gợi ý {hint.level}: {hint.title}</p><p className="mt-1 text-sm leading-6 text-ink2">{hint.body}</p></div>)}</div>}{showSample && <div className="mt-4 space-y-3" aria-live="polite">{prompt.sampleAnswers.map((sample, index) => <div key={`${sample.answer}-${index}`} className="rounded-xl border border-jade/20 bg-jade/10 p-4"><p className="text-sm font-extrabold leading-6 text-ink">{sample.answer}</p>{sample.translationVi && <p className="mt-2 text-sm italic leading-6 text-ink2">{sample.translationVi}</p>}{sample.notes && <p className="mt-3 border-t border-jade/15 pt-3 text-xs leading-5 text-muted">{sample.notes}</p>}</div>)}<p className="text-xs leading-5 text-muted">Đã đánh dấu bạn dùng câu mẫu để AI điều chỉnh phản hồi cho phù hợp.</p></div>}</article>;
}

function FeedbackPanel({ attempt, fallbackCriteria }: { attempt: AttemptView; fallbackCriteria: FeedbackCriterion[] }) {
  const feedback = attempt.feedback;
  const criteria = feedback.criteria.length ? feedback.criteria : fallbackCriteria;
  return <article className="premium-card overflow-hidden"><div className="border-b border-line bg-jade/10 px-5 py-5 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-jade2">Phản hồi AI</p><h2 className="mt-1 text-xl font-extrabold text-ink">Phản hồi cho bài viết của bạn</h2></div>{feedback.score != null && <div className="rounded-2xl border border-jade/25 bg-surface px-4 py-3 text-center"><strong className="block text-3xl font-extrabold text-jade">{feedback.score}</strong><span className="text-xs font-bold text-muted">/{feedback.maxScore ?? "?"} điểm</span></div>}</div>{feedback.label && <p className="mt-3 text-sm font-bold text-jade2">{feedback.label}</p>}{feedback.summary && <p className="mt-2 text-sm leading-6 text-ink2">{feedback.summary}</p>}<p className="mt-3 text-xs leading-5 text-muted">Ước tính học tập dựa trên bài bạn đã làm; không phải điểm ETS chính thức.</p></div><div className="space-y-5 p-5 sm:p-6">{feedback.checks.length > 0 && <section><h3 className="text-sm font-extrabold text-ink">Kiểm tra nhanh</h3><div className="mt-3 space-y-2">{feedback.checks.map((check) => <div key={check.id} className={`rounded-xl border p-3 ${check.passed ? "border-jade/20 bg-jade/10" : "border-terracotta/20 bg-terracotta/10"}`}><div className="flex gap-2"><span className={`font-extrabold ${check.passed ? "text-jade2" : "text-terracotta2"}`} aria-hidden="true">{check.passed ? "✓" : "!"}</span><div><p className="text-sm font-extrabold text-ink">{check.label}</p>{check.detail && <p className="mt-1 text-xs leading-5 text-ink2">{check.detail}</p>}</div></div></div>)}</div></section>}{criteria.length > 0 && <section><h3 className="text-sm font-extrabold text-ink">Theo tiêu chí</h3><div className="mt-3 space-y-2">{criteria.map((criterion) => <div key={criterion.id} className="rounded-xl border border-line bg-surface-soft/55 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-extrabold text-ink">{criterion.label}</p>{criterion.score != null && <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-extrabold text-primary">{criterion.score}/{criterion.maxScore ?? "?"}</span>}</div>{criterion.note && <p className="mt-1 text-xs leading-5 text-muted">{criterion.note}</p>}</div>)}</div></section>}{feedback.strengths.length > 0 && <FeedbackList title="Bạn đang làm tốt" icon="✓" tone="jade" items={feedback.strengths} />}{feedback.improvements.length > 0 && <FeedbackList title="Điều cần cải thiện" icon="→" tone="terracotta" items={feedback.improvements} />}{feedback.revisedAnswer && <section className="rounded-xl border border-azure/20 bg-azure/10 p-4"><p className="text-sm font-extrabold text-azure2">Phiên bản tham khảo</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink">{feedback.revisedAnswer}</p></section>}{feedback.nextAction && <section className="rounded-xl border border-primary/20 bg-primary/10 p-4"><p className="text-sm font-extrabold text-primary">Bước tiếp theo</p><p className="mt-1 text-sm leading-6 text-ink2">{feedback.nextAction}</p></section>}<Link href="/writing/history" className="inline-flex text-sm font-extrabold text-primary hover:underline">Xem tất cả lịch sử bài viết →</Link></div></article>;
}

function PartOneCompletionNav({ prompt, attempt }: { prompt: WritingPrompt; attempt: AttemptView }) {
  const category = prompt.part1Category;
  const categoryLabel = grammarCategoryLabel(category);
  const sameCategoryHref = category
    ? `/writing?part=1&category=${encodeURIComponent(category)}`
    : "/writing?part=1";
  const scoreText = attempt.feedback.score != null
    ? `${attempt.feedback.score}/${attempt.feedback.maxScore ?? "?"} điểm`
    : "đã được chấm";

  return (
    <article className="premium-card border border-primary/20 bg-primary/10 p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-gold-ink" aria-hidden="true">✓</span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Hoàn thành một câu</p>
          <h2 className="mt-1 text-lg font-extrabold text-ink">Bạn vừa luyện xong nhóm {categoryLabel}</h2>
          <p className="mt-2 text-sm leading-6 text-ink2">
            Kết quả <strong className="text-ink">{scoreText}</strong> của câu này đã được lưu. Tiếp tục với một câu cùng nhóm để củng cố đúng cấu trúc, hoặc đổi nhóm khi bạn đã sẵn sàng.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link href={sameCategoryHref} className="premium-primary inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline">
          Luyện câu tiếp theo {category ? `· ${categoryLabel}` : ""} <span className="ml-1" aria-hidden="true">→</span>
        </Link>
        <Link href="/writing?part=1" className="premium-secondary inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline">
          Chọn nhóm khác
        </Link>
        <Link href="/writing/history" className="inline-flex items-center px-2 text-sm font-extrabold text-primary hover:underline">
          Xem tiến trình đã lưu
        </Link>
      </div>
    </article>
  );
}

function FeedbackList({ title, icon, tone, items }: { title: string; icon: string; tone: "jade" | "terracotta"; items: string[] }) {
  const color = tone === "jade" ? "bg-jade/10 text-jade2" : "bg-terracotta/10 text-terracotta2";
  return <section><h3 className="text-sm font-extrabold text-ink">{title}</h3><ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${index}-${item}`} className={`flex gap-2 rounded-xl px-3 py-2.5 text-sm leading-6 ${color}`}><span className="font-extrabold" aria-hidden="true">{icon}</span><span>{item}</span></li>)}</ul></section>;
}

function placeholderForPart(part: number) {
  if (part === 1) return "Write one complete sentence based on the picture...";
  if (part === 2) return "Write your email response here. Remember to address every request...";
  return "Write your opinion essay here. Aim for clear paragraphs and supporting examples...";
}

function responseRuleLabel(prompt: WritingPrompt) {
  const { minWords, recommendedWords, maxWords, minSentences, maxSentences } = prompt.responseRules;
  const parts: string[] = [];
  if (recommendedWords) parts.push(`Mục tiêu: khoảng ${recommendedWords} từ`);
  else if (minWords) parts.push(`Tối thiểu: ${minWords} từ`);
  if (maxWords) parts.push(`tối đa ${maxWords} từ`);
  if (minSentences && maxSentences && minSentences === maxSentences) parts.push(`${minSentences} câu`);
  else if (minSentences) parts.push(`ít nhất ${minSentences} câu`);
  return parts.length ? parts.join(" · ") : "AI phản hồi theo rubric học tập.";
}
