"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LearningHero, LearningTip, LearningEmpty } from "../_components/LearningDashboardUI";
import Icon from "../listen/_components/ListeningIcon";
import { ListeningProgressRing } from "../listen/_components/ListeningTestCard";
import { ListeningGridSkeleton } from "../listen/_components/ListeningLoading";
import styles from "../listen/_components/listening.module.css";
import { useAuthenticatedSession } from "@/components/AuthenticatedSessionContext";
import {
  WRITING_PART_ONE_GRAMMAR_CATEGORIES,
  WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS,
  type WritingAttempt,
  type WritingPart,
  type WritingPartOneGrammarCategory,
  type WritingPromptCard as WritingPromptCardSummary,
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

function normalizePrompts(data: unknown): WritingPromptCardSummary[] {
  if (Array.isArray(data)) return data as WritingPromptCardSummary[];
  if (data && typeof data === "object") {
    const record = data as { prompts?: unknown; items?: unknown };
    if (Array.isArray(record.prompts)) return record.prompts as WritingPromptCardSummary[];
    if (Array.isArray(record.items)) return record.items as WritingPromptCardSummary[];
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
      && [1, 2, 3].includes(attempt.promptPart ?? 0)
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

function grammarCategoryForPrompt(
  prompt: Pick<WritingPromptCardSummary, "id" | "part" | "part1Category" | "tags">,
): WritingPartOneGrammarCategory | null {
  if (prompt.part !== 1) return null;

  // `part1Category` is the canonical API field. The alternate property and
  // tag matching keep historical/custom content discoverable.
  const compatibilityPrompt = prompt as typeof prompt & { grammarCategory?: unknown; part1Category?: unknown };
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
  const authenticated = useAuthenticatedSession();
  const requestedPart = parsePart(searchParams.get("part"));
  const requestedCategory = parsePartOneCategory(searchParams.get("category"));
  const [part, setPart] = useState<WritingPart>(() => requestedPart ?? 1);
  const [scoreStatus, setScoreStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusFilter, setStatusFilter] = useState<"all" | "scored">("all");
  const [sort, setSort] = useState("catalog");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [partOneCategory, setPartOneCategory] = useState<ActivePartOneCategory>(() => requestedPart === 1 ? requestedCategory ?? "all" : "all");
  const [reloadKey, setReloadKey] = useState(0);
  const [prompts, setPrompts] = useState<WritingPromptCardSummary[]>([]);
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
    if (!authenticated) return;

    let cancelled = false;

    // Score badges are private, so fetch them only after the shell has
    // confirmed an authenticated session.
    fetch(`/api/writing/attempts/history?part=${part}&limit=30`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("History unavailable");
        const body = await response.json() as ApiEnvelope<unknown>;
        if (body.success === false) throw new Error("History unavailable");
        return normalizeAttempts(unwrap(body));
      })
      .then((attempts) => {
        if (!cancelled) { setLatestScores(scoreByPromptId(attempts)); setScoreStatus("ready"); }
      })
      .catch(() => {
        if (!cancelled) { setLatestScores({}); setScoreStatus("error"); }
      });

    return () => { cancelled = true; };
  }, [authenticated, part, reloadKey]);

  function choosePart(nextPart: WritingPart) {
    if (nextPart === part) return;
    setLoading(true);
    setError(null);
    setTag("all");
    setPartOneCategory("all");
    setLatestScores({});
    setScoreStatus("loading");
    setStatusFilter("all");
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
      return (!normalizedQuery || haystack.includes(normalizedQuery)) && matchesPartOneCategory && matchesTag && (statusFilter === "all" || (authenticated && Boolean(latestScores[prompt.id])));
    }).sort((left, right) => sort === "duration" ? left.timeLimitMinutes - right.timeLimitMinutes : 0);
  }, [part, partOneCategory, prompts, query, tag, sort, statusFilter, latestScores, authenticated]);
  const scoresReady = authenticated && scoreStatus === "ready";
  const scoredPrompts = prompts.filter((prompt) => latestScores[prompt.id]);
  const nextPrompt = prompts.find((prompt) => !latestScores[prompt.id]) ?? prompts[0];
  const average = scoredPrompts.length ? Math.round(scoredPrompts.reduce((sum, prompt) => {
    const score = latestScores[prompt.id];
    return sum + (score.maxScore > 0 ? score.score / score.maxScore * 100 : 0);
  }, 0) / scoredPrompts.length) : null;
  function clearFilters() { setQuery(""); setTag("all"); setPartOneCategory("all"); setStatusFilter("all"); }
  return <main className={styles.dashboard}>
    <span className={styles.eyebrow}>KHÔNG GIAN LUYỆN TẬP</span>
    <header className={styles.intro}><div><h1>Luyện viết<span>.</span></h1><p>Từng ý tưởng nhỏ. Từng câu viết tốt hơn.</p></div><Link className={styles.dictationLink} href="/writing/history"><Icon name="clock" />Lịch sử bài viết<Icon name="arrow" /></Link></header>
    <LearningHero icon="pen" title="Biến ý tưởng thành câu chữ." description={loading ? "Chọn một dạng bài. Viết, nhận phản hồi và thử lại." : nextPrompt ? `Bài gợi ý · ${nextPrompt.titleVi || nextPrompt.title}` : "Khám phá đề viết theo tranh, email và bài luận."}
      href={!loading && nextPrompt ? `/writing/practice/${encodeURIComponent(nextPrompt.id)}` : undefined} cta="Bắt đầu luyện viết" note="Một bài viết, một bước tiến"
      stats={[
        { label: "Đề luyện viết", value: loading || error ? "—" : prompts.length, unit: "đề", detail: `Trong Part ${part} đang chọn`, icon: "document" },
        { label: "Đề đã chấm", value: scoresReady ? scoredPrompts.length : "—", detail: "Trong 30 lượt gần nhất của Part", icon: "check" },
        { label: "Điểm AI TB", value: scoresReady && average !== null ? average : "—", unit: "%", detail: "Điểm mới nhất mỗi đề / điểm tối đa", icon: "target" },
      ]} />
    <div className={styles.sectionLabel}><span className={styles.eyebrow}>01 / CHỌN DẠNG BÀI</span><span>Viết đúng trước, viết hay sau</span></div>
    <nav className={styles.parts} data-columns="3" aria-label="Chọn dạng bài viết">{PARTS.map((item) => <button key={item.id} type="button" className={styles.part} onClick={() => choosePart(item.id)} aria-pressed={item.id === part}>
      <span className={styles.partIcon}><Icon name={item.id === 1 ? "image" : item.id === 2 ? "reply" : "pen"} /></span><span className={styles.partText}><span>PART {item.id}</span><strong>{item.title}</strong><small>{item.description}</small></span>
    </button>)}</nav>
    <section className={styles.library} aria-label="Thư viện đề viết">
      <div className={styles.libraryHeading}><div><span className={styles.eyebrow}>02 / BÀI LUYỆN CỦA BẠN</span><h2>{labelForPart(part)}</h2></div><p className={styles.catalogTotal}><strong>{loading ? "—" : prompts.length}</strong> đề viết</p></div>
      <div className={styles.toolbar}>
        <div className={styles.filters} aria-label="Lọc bài đã chấm">
          <button type="button" aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Tất cả</button>
          <button type="button" aria-pressed={statusFilter === "scored"} disabled={!scoresReady} onClick={() => setStatusFilter("scored")}>Đã chấm gần đây<span>{scoresReady ? scoredPrompts.length : "—"}</span></button>
        </div>
        <div className={styles.tools}><label className={styles.search}><Icon name="search" /><input aria-label="Tìm đề viết" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm chủ đề, từ khóa..." /></label>
          <label className={styles.sort}><span>Sắp xếp</span><select aria-label="Sắp xếp đề viết" value={sort} onChange={(event) => setSort(event.target.value)}><option value="catalog">Theo thư viện</option><option value="duration">Thời lượng ngắn nhất</option></select></label>
        </div>
      </div>
      {part === 1 ? <div className="mt-4"><p className={styles.cardDescription}>Luyện theo cặp từ · Chọn cấu trúc bạn muốn cải thiện.</p><div className={styles.filters} aria-label="Lọc câu theo dạng từ">
        <GrammarCategoryChip active={partOneCategory === "all"} count={prompts.length} onClick={() => setPartOneCategory("all")}>Tất cả</GrammarCategoryChip>
        {WRITING_PART_ONE_GRAMMAR_CATEGORIES.map((category) => <GrammarCategoryChip key={category} active={partOneCategory === category} count={partOneCounts[category]} onClick={() => setPartOneCategory(category)}>{WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS[category]}</GrammarCategoryChip>)}
      </div></div> : tags.length > 0 && <details className={styles.topicFilters}><summary>Chủ đề: {tag === "all" ? "Tất cả" : tag}</summary><div className={styles.filters} aria-label="Lọc theo chủ đề">
        <FilterChip active={tag === "all"} onClick={() => setTag("all")}>Tất cả</FilterChip>{tags.map((item) => <FilterChip key={item} active={tag === item} onClick={() => setTag(item)}>{item}</FilterChip>)}
      </div></details>}
      {authenticated && scoreStatus === "error" && <p className={styles.notice} role="status">Chưa tải được điểm cá nhân. Bạn vẫn có thể mở đề và luyện viết.</p>}
      <p className={styles.resultCount} aria-live="polite">{loading ? "Đang tải đề viết..." : `Hiển thị ${filteredPrompts.length}/${prompts.length} đề`}</p>
      {loading ? <ListeningGridSkeleton /> : error ? <div className={styles.empty} role="alert"><Icon name="document" /><h3>Chưa tải được thư viện đề</h3><p>{error}</p><button className={styles.primaryButton} type="button" onClick={retryLoad}>Thử lại<Icon name="reset" /></button></div>
        : !filteredPrompts.length ? <LearningEmpty title="Chưa có đề phù hợp" description="Thử đổi từ khóa hoặc bỏ bộ lọc để xem thêm đề." onReset={clearFilters} />
        : <div className={styles.grid}>{filteredPrompts.map((prompt, index) => <WritingPromptCard key={prompt.id} index={index} prompt={prompt} latestScore={scoresReady ? latestScores[prompt.id] : undefined} />)}</div>}
      <p className={styles.caption}>Điểm AI là ước tính học tập, không phải điểm ETS chính thức. Thống kê chỉ gồm đề trong thư viện xuất hiện ở 30 lượt nộp gần nhất của Part; không phải toàn bộ lịch sử.</p>
    </section>
    <LearningTip title="Mẹo luyện viết">Viết bản đầu tiên bằng ý của bạn, rồi đối chiếu phản hồi AI. Mỗi lần viết lại, tập trung sửa một điểm: ngữ pháp, từ vựng hoặc cách tổ chức ý.</LearningTip>
    <p className={styles.caption}>Đề, ảnh, từ khóa và câu mẫu trong thư viện là nội dung tự biên soạn. Dùng phản hồi AI như gợi ý, không phải chứng nhận điểm thi.</p>
  </main>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors ${active ? "border-primary bg-primary text-gold-ink" : "border-line bg-surface-soft text-ink2 hover:border-primary/35"}`}>{children}</button>;
}

function GrammarCategoryChip({ active, count, onClick, children }: { active: boolean; count: number; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.97] ${active ? "border-primary bg-primary text-gold-ink shadow-sm" : "border-line bg-surface-soft text-ink2 hover:border-primary/35 hover:bg-surface"}`}><span>{children}</span>{" "}<span className={`rounded-md px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20 text-inherit" : "bg-primary/10 text-primary"}`}>{count} câu</span></button>;
}

function WritingPromptCard({ prompt, latestScore, index }: { prompt: WritingPromptCardSummary; latestScore?: PromptScore; index: number }) {
  const grammarCategory = grammarCategoryForPrompt(prompt);
  const percent = latestScore && latestScore.maxScore > 0 ? Math.min(100, Math.max(0, Math.round(latestScore.score / latestScore.maxScore * 100))) : 0;
  return <article className={styles.card} style={{ "--card-delay": `${Math.min(index, 5) * 35}ms` } as CSSProperties}>
    {prompt.part === 1 && prompt.thumbnailUrl && <div className={styles.cardImage}><Image src={prompt.thumbnailUrl} alt={prompt.imageAlt || prompt.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1050px) 50vw, 33vw" loading="lazy" className="object-cover" /></div>}
    <div className={styles.cardTop}><span className={styles.cardLabel}>LUYỆN VIẾT · PART {prompt.part}</span><span className={styles.badge} data-status={latestScore ? "complete" : "new"}><span />{latestScore ? "Đã chấm gần đây" : "Đề luyện viết"}</span></div>
    <div className={styles.cardHeading}><div><h3>{prompt.title}</h3>{prompt.titleVi && <p>{prompt.titleVi}</p>}<p>{latestScore ? `Điểm AI: ${latestScore.score}/${latestScore.maxScore}` : "Chưa có điểm gần đây"}</p></div><ListeningProgressRing percent={percent} ready={Boolean(latestScore)} label={`Điểm AI so với tối đa: ${prompt.title}`} /></div>
    <p className={styles.cardDescription}>{prompt.summary}</p>
    <div className={styles.answerStats}>{prompt.requiredTerms?.slice(0, 3).map((term) => <span key={term} data-tone="good"><i />{term}</span>)}</div>
    <div className={styles.metadata}><span><Icon name="clock" />{prompt.timeLimitMinutes} phút</span><span><Icon name="bars" />{{ BEGINNER: "Cơ bản", INTERMEDIATE: "Trung cấp", ADVANCED: "Nâng cao" }[prompt.difficulty]}</span>{grammarCategory && <span>{WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS[grammarCategory]}</span>}{prompt.tags?.slice(0, 2).map((tag) => <span key={tag}>#{tag}</span>)}</div>
    <footer className={styles.cardFooter}><Link className={styles.cardCta} href={`/writing/practice/${encodeURIComponent(prompt.id)}`}>{latestScore ? "Luyện viết lại" : "Luyện viết"}<Icon name="arrow" /></Link></footer>
  </article>;
}
