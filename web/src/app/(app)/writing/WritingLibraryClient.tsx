"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  WRITING_PART_ONE_GRAMMAR_CATEGORIES,
  WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS,
  type WritingAttempt,
  type WritingPart,
  type WritingPartOneGrammarCategory,
  type WritingPrompt,
} from "@/types/writing";

const PARTS: Array<{
  id: WritingPart;
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  gradient: string;
}> = [
  {
    id: 1,
    eyebrow: "Part 1 · Picture",
    title: "Viết câu theo tranh",
    description: "Dùng đủ hai từ khóa, đúng ngữ pháp và sát bối cảnh ảnh.",
    icon: "✦",
    gradient: "from-azure to-celadon",
  },
  {
    id: 2,
    eyebrow: "Part 2 · Email",
    title: "Trả lời email công việc",
    description: "Xử lý đúng yêu cầu, rõ giọng điệu và bố cục chuyên nghiệp.",
    icon: "✉",
    gradient: "from-plum to-azure",
  },
  {
    id: 3,
    eyebrow: "Part 3 · Opinion essay",
    title: "Bài luận nêu quan điểm",
    description: "Lập luận có dẫn chứng, tổ chức ý và dùng tiếng Anh thuyết phục.",
    icon: "▤",
    gradient: "from-terracotta to-primary",
  },
];

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: string };
type ActivePartOneCategory = WritingPartOneGrammarCategory | "all";

type PromptScore = {
  score: number;
  maxScore: number;
  submittedAtMillis: number;
};

const LEGACY_PART_ONE_CATEGORIES: Record<string, WritingPartOneGrammarCategory> = {
  "p1-meeting-preparation": "V_N",
  "p1-restaurant-service": "V_N",
  "p1-delivery-packages": "V_N",
  "p1-airport-flight": "V_N",
  "p1-office-report": "V_N",
};

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as ApiEnvelope<T>).data as T;
  }
  return body as T;
}

function labelForPart(part: WritingPart) {
  return PARTS.find((item) => item.id === part)?.title ?? `Part ${part}`;
}

function normalizePrompts(data: unknown): WritingPrompt[] {
  if (Array.isArray(data)) return data as WritingPrompt[];
  if (data && typeof data === "object") {
    const record = data as { prompts?: unknown; items?: unknown };
    if (Array.isArray(record.prompts)) return record.prompts as WritingPrompt[];
    if (Array.isArray(record.items)) return record.items as WritingPrompt[];
  }
  return [];
}

function normalizeAttempts(data: unknown): WritingAttempt[] {
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as { attempts?: unknown; items?: unknown }
    : null;
  const items = Array.isArray(data) ? data : record?.attempts ?? record?.items;
  if (!Array.isArray(items)) return [];

  return items.filter((item): item is WritingAttempt => {
    if (!item || typeof item !== "object") return false;
    const attempt = item as Partial<WritingAttempt>;
    return typeof attempt.promptId === "string"
      && attempt.promptPart === 1
      && typeof attempt.submittedAtMillis === "number"
      && typeof attempt.feedback?.score === "number"
      && typeof attempt.feedback.maxScore === "number";
  });
}

function parsePart(value: string | null): WritingPart | null {
  return value === "1" || value === "2" || value === "3" ? Number(value) as WritingPart : null;
}

function parsePartOneCategory(value: string | null): WritingPartOneGrammarCategory | null {
  return value && (WRITING_PART_ONE_GRAMMAR_CATEGORIES as readonly string[]).includes(value)
    ? value as WritingPartOneGrammarCategory
    : null;
}

function categoryFromText(value: string): WritingPartOneGrammarCategory | null {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "nn" || normalized === "nounnoun") return "N_N";
  if (normalized === "vn" || normalized === "verbnoun") return "V_N";
  if (normalized === "nprep" || normalized === "nounprep" || normalized === "nounpreposition") return "N_PREP";
  if (normalized === "vprep" || normalized === "verbprep" || normalized === "verbpreposition") return "V_PREP";
  return null;
}

function grammarCategoryForPrompt(prompt: WritingPrompt): WritingPartOneGrammarCategory | null {
  if (prompt.part !== 1) return null;

  // `part1Category` is the canonical API field. The alternate property and
  // tag matching keep historical/custom content discoverable.
  const compatibilityPrompt = prompt as WritingPrompt & { grammarCategory?: unknown; part1Category?: unknown };
  const explicitCategory = typeof compatibilityPrompt.part1Category === "string"
    ? compatibilityPrompt.part1Category
    : typeof compatibilityPrompt.grammarCategory === "string"
      ? compatibilityPrompt.grammarCategory
      : null;
  const fromExplicit = explicitCategory ? parsePartOneCategory(explicitCategory) ?? categoryFromText(explicitCategory) : null;
  if (fromExplicit) return fromExplicit;

  for (const tag of prompt.tags ?? []) {
    const fromTag = categoryFromText(tag);
    if (fromTag) return fromTag;
  }

  return LEGACY_PART_ONE_CATEGORIES[prompt.id] ?? null;
}

function scoreByPromptId(attempts: WritingAttempt[]): Record<string, PromptScore> {
  return attempts.reduce<Record<string, PromptScore>>((scores, attempt) => {
    const candidate: PromptScore = {
      score: attempt.feedback.score,
      maxScore: attempt.feedback.maxScore,
      submittedAtMillis: attempt.submittedAtMillis,
    };
    const existing = scores[attempt.promptId];
    if (!existing || candidate.submittedAtMillis > existing.submittedAtMillis) scores[attempt.promptId] = candidate;
    return scores;
  }, {});
}

export default function WritingLibraryClient() {
  const searchParams = useSearchParams();
  const requestedPart = parsePart(searchParams.get("part"));
  const requestedCategory = parsePartOneCategory(searchParams.get("category"));
  const [part, setPart] = useState<WritingPart>(() => requestedPart ?? 1);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [partOneCategory, setPartOneCategory] = useState<ActivePartOneCategory>(() => requestedPart === 1 ? requestedCategory ?? "all" : "all");
  const [reloadKey, setReloadKey] = useState(0);
  const [prompts, setPrompts] = useState<WritingPrompt[]>([]);
  const [latestScores, setLatestScores] = useState<Record<string, PromptScore>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/writing/prompts?part=${part}`)
      .then(async (response) => {
        const body = await response.json() as ApiEnvelope<unknown>;
        if (!response.ok || body.success === false) throw new Error(body.error || "Không thể tải thư viện đề viết.");
        return normalizePrompts(unwrap(body));
      })
      .then((next) => {
        if (!cancelled) {
          setPrompts(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setPrompts([]);
          setError(reason instanceof Error ? reason.message : "Không thể tải thư viện đề viết.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [part, reloadKey]);

  useEffect(() => {
    let cancelled = false;

    // The history endpoint is private. A signed-out learner can still browse
    // the library; in that case we simply leave score badges absent.
    fetch("/api/writing/attempts/history?part=1&limit=30", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [] as WritingAttempt[];
        const body = await response.json() as ApiEnvelope<unknown>;
        if (body.success === false) return [] as WritingAttempt[];
        return normalizeAttempts(unwrap(body));
      })
      .then((attempts) => {
        if (!cancelled) setLatestScores(scoreByPromptId(attempts));
      })
      .catch(() => {
        if (!cancelled) setLatestScores({});
      });

    return () => { cancelled = true; };
  }, [reloadKey]);

  function choosePart(nextPart: WritingPart) {
    if (nextPart === part) return;
    setLoading(true);
    setError(null);
    setTag("all");
    setPartOneCategory("all");
    setPart(nextPart);
  }

  function retryLoad() {
    setLoading(true);
    setError(null);
    setReloadKey((value) => value + 1);
  }

  const tags = useMemo(() => [...new Set(prompts.flatMap((prompt) => prompt.tags ?? []))].sort((left, right) => left.localeCompare(right)), [prompts]);
  const partOneCounts = useMemo(() => {
    const counts = Object.fromEntries(WRITING_PART_ONE_GRAMMAR_CATEGORIES.map((category) => [category, 0])) as Record<WritingPartOneGrammarCategory, number>;
    prompts.forEach((prompt) => {
      const category = grammarCategoryForPrompt(prompt);
      if (category) counts[category] += 1;
    });
    return counts;
  }, [prompts]);
  const filteredPrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
    return prompts.filter((prompt) => {
      const haystack = [prompt.title, prompt.titleVi, prompt.summary, ...(prompt.tags ?? [])].filter(Boolean).join(" ").toLocaleLowerCase("vi-VN");
      const matchesPartOneCategory = part !== 1 || partOneCategory === "all" || grammarCategoryForPrompt(prompt) === partOneCategory;
      const matchesTag = part === 1 || tag === "all" || prompt.tags?.includes(tag);
      return (!normalizedQuery || haystack.includes(normalizedQuery)) && matchesPartOneCategory && matchesTag;
    });
  }, [part, partOneCategory, prompts, query, tag]);
  return (
    <main className="app-canvas min-h-[calc(100dvh-4rem)] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-7 pb-10">
        <section className="premium-hero overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="premium-hero-orbit" aria-hidden="true" />
          <div className="relative max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-primary">
              <span aria-hidden="true">✦</span> TOEIC Writing Lab
            </p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              Luyện viết có lộ trình, nhận phản hồi bằng AI.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
              Từ một câu theo ảnh đến email và bài luận: mỗi đề có gợi ý theo tầng, câu mẫu và tiêu chí chấm riêng.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/writing/history" className="premium-secondary inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline">
                Xem lịch sử bài viết
              </Link>
              <span className="inline-flex items-center rounded-xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-xs font-bold leading-5 text-ink2">
                Kết quả là ước tính học tập, không phải điểm ETS chính thức.
              </span>
            </div>
          </div>
        </section>

        <section aria-label="Chọn dạng bài viết" className="grid gap-3 md:grid-cols-3">
          {PARTS.map((item) => {
            const active = item.id === part;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => choosePart(item.id)}
                aria-pressed={active}
                className={`group rounded-2xl border p-4 text-left transition-colors ${active ? "border-primary/45 bg-primary/10 shadow-[0_12px_32px_color-mix(in_srgb,var(--primary)_12%,transparent)]" : "border-line bg-surface hover:border-primary/30 hover:bg-surface-soft"}`}
              >
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} text-lg font-extrabold text-white shadow-sm`} aria-hidden="true">{item.icon}</span>
                <p className={`mt-4 text-xs font-extrabold uppercase tracking-wider ${active ? "text-primary" : "text-muted"}`}>{item.eyebrow}</p>
                <h2 className="mt-1 text-lg font-extrabold text-ink">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
              </button>
            );
          })}
        </section>

        <section className="premium-card p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Thư viện đề</p>
              <h2 className="mt-1 text-2xl font-extrabold text-ink">{labelForPart(part)}</h2>
            </div>
            <label className="relative block w-full lg:max-w-sm">
              <span className="sr-only">Tìm đề viết</span>
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted" aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm chủ đề, tình huống, từ khóa..." className="w-full pl-10 pr-4 text-sm" />
            </label>
          </div>
          {part === 1 ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <p className="text-sm font-extrabold text-ink">Luyện theo cặp từ</p>
                  <p className="mt-1 text-xs leading-5 text-muted">Chọn một dạng để luyện nhiều câu cùng cấu trúc.</p>
                </div>
                <span className="text-xs font-extrabold text-primary">{prompts.length} câu trong thư viện</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Lọc câu theo dạng từ">
                <GrammarCategoryChip active={partOneCategory === "all"} count={prompts.length} onClick={() => setPartOneCategory("all")}>Tất cả</GrammarCategoryChip>
                {WRITING_PART_ONE_GRAMMAR_CATEGORIES.map((category) => (
                  <GrammarCategoryChip key={category} active={partOneCategory === category} count={partOneCounts[category]} onClick={() => setPartOneCategory(category)}>
                    {WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS[category]}
                  </GrammarCategoryChip>
                ))}
              </div>
            </div>
          ) : tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Lọc theo chủ đề">
              <FilterChip active={tag === "all"} onClick={() => setTag("all")}>Tất cả</FilterChip>
              {tags.map((item) => <FilterChip key={item} active={tag === item} onClick={() => setTag(item)}>{item}</FilterChip>)}
            </div>
          )}
        </section>

        {loading ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Đang tải đề viết">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-72 animate-pulse rounded-2xl border border-line bg-surface-soft" />)}
          </section>
        ) : error ? (
          <section className="premium-card p-8 text-center">
            <p className="text-lg font-extrabold text-ink">Chưa tải được thư viện đề</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button type="button" onClick={retryLoad} className="premium-secondary mt-5 rounded-xl px-4 py-2 text-sm font-extrabold">Thử lại</button>
          </section>
        ) : filteredPrompts.length === 0 ? (
          <section className="premium-card p-10 text-center">
            <p className="text-lg font-extrabold text-ink">Chưa có đề phù hợp</p>
            <p className="mt-2 text-sm text-muted">Thử đổi từ khóa hoặc bỏ bộ lọc chủ đề để xem thêm đề.</p>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={`Danh sách ${labelForPart(part)}`}>
            {filteredPrompts.map((prompt) => <WritingPromptCard key={prompt.id} prompt={prompt} latestScore={latestScores[prompt.id]} />)}
          </section>
        )}

        <p className="mx-auto max-w-3xl text-center text-xs leading-5 text-muted">
          Đề, ảnh, từ khóa và câu mẫu trong thư viện là nội dung tự biên soạn. AI hỗ trợ phản hồi để bạn học tốt hơn; hãy dùng phản hồi như gợi ý, không phải chứng nhận điểm thi.
        </p>
      </div>
    </main>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors ${active ? "border-primary bg-primary text-gold-ink" : "border-line bg-surface-soft text-ink2 hover:border-primary/35"}`}>{children}</button>;
}

function GrammarCategoryChip({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.97] ${active ? "border-primary bg-primary text-gold-ink shadow-sm" : "border-line bg-surface-soft text-ink2 hover:border-primary/35 hover:bg-surface"}`}><span>{children}</span><span className={`rounded-md px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20 text-inherit" : "bg-primary/10 text-primary"}`}>{count} câu</span></button>;
}

function WritingPromptCard({ prompt, latestScore }: { prompt: WritingPrompt; latestScore?: PromptScore }) {
  const partMeta = PARTS.find((item) => item.id === prompt.part) ?? PARTS[0];
  const hasImage = prompt.part === 1 && Boolean(prompt.imageUrl);
  const grammarCategory = grammarCategoryForPrompt(prompt);
  return (
    <article className="premium-card premium-card--interactive group overflow-hidden">
      <div
        role={hasImage ? "img" : undefined}
        aria-label={hasImage ? prompt.imageAlt || prompt.title : undefined}
        className={`relative flex min-h-32 items-end overflow-hidden p-4 ${hasImage ? "bg-surface-soft bg-cover bg-center" : `bg-gradient-to-br ${partMeta.gradient}`}`}
        style={hasImage ? { backgroundImage: `linear-gradient(180deg, transparent 22%, color-mix(in srgb, var(--s0) 78%, transparent)), url("${prompt.imageUrl}")` } : undefined}
      >
        <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[11px] font-extrabold text-white backdrop-blur-sm">Part {prompt.part}</span>
        {latestScore && <span title="Điểm ước tính từ lần làm gần nhất" className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-jade/35 bg-jade/90 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm"><span aria-hidden="true">✓</span> Điểm {latestScore.score}/{latestScore.maxScore}</span>}
        {!hasImage && <span className="text-4xl text-white" aria-hidden="true">{partMeta.icon}</span>}
        {hasImage && <span className="text-xs font-bold text-white/90">{grammarCategory ? WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS[grammarCategory] : "Ảnh luyện viết gốc"}</span>}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-6 text-ink">{prompt.title}</h3>
            {prompt.titleVi && <p className="mt-1 text-sm text-primary">{prompt.titleVi}</p>}
          </div>
          <span className="shrink-0 rounded-lg bg-surface-soft px-2 py-1 text-[11px] font-extrabold text-muted">{prompt.timeLimitMinutes} phút</span>
        </div>
        <p className="mt-3 min-h-12 text-sm leading-6 text-muted">{prompt.summary}</p>
        {prompt.requiredTerms?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {prompt.requiredTerms.slice(0, 3).map((term) => <span key={term} className="rounded-md bg-azure/10 px-2 py-1 text-xs font-bold text-azure2">{term}</span>)}
            {prompt.requiredTerms.length > 3 && <span className="rounded-md bg-surface-soft px-2 py-1 text-xs font-bold text-muted">+{prompt.requiredTerms.length - 3}</span>}
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex min-w-0 flex-wrap gap-1.5">{prompt.tags?.slice(0, 2).map((item) => <span key={item} className="text-xs font-bold text-muted">#{item}</span>)}</div>
          <Link href={`/writing/practice/${encodeURIComponent(prompt.id)}`} className="premium-primary inline-flex shrink-0 items-center rounded-xl px-3.5 py-2 text-sm font-extrabold no-underline">Luyện viết <span className="ml-1" aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  );
}
