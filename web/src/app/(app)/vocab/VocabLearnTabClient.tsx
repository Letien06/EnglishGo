"use client";

import Link from "@/components/IntentLink";
import { useEffect, useMemo, useState } from "react";
import type { DauToeicVocabCatalogView } from "@/types/dautoeic";
import type { VocabSetCard } from "@/types/vocab";
import { LearningTip, LearningEmpty } from "../_components/LearningDashboardUI";
import Icon from "../listen/_components/ListeningIcon";
import vocabStyles from "./[setId]/flashcards/vocabulary.module.css";
import VocabCatalogSkeleton from "./VocabCatalogSkeleton";
import styles from "../listen/_components/listening.module.css";
import { fetchWithTimeout, recordNextPaint } from "@/lib/client-request";

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type LearnState =
  | { status: "loading"; catalog: DauToeicVocabCatalogView | null; fallbackSets: VocabSetCard[] }
  | { status: "ready"; catalog: DauToeicVocabCatalogView | null; fallbackSets: VocabSetCard[] }
  | { status: "error"; catalog: null; fallbackSets: VocabSetCard[] };

function studyHref(setId: number, intent: "continue" | "review") {
  return `/vocab/${setId}/flashcards?mode=menu&tab=learn&intent=${intent}&order=${intent === "review" ? "oldest" : "ordered"}&amount=all`;
}

export default function VocabLearnTabClient({ groupId, userUid, initialCatalog = null }: {
  groupId?: string; userUid?: string; initialCatalog?: DauToeicVocabCatalogView | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("catalog");
  const [selectedGroupOverride, setSelectedGroupOverride] = useState<string | undefined>(groupId);
  const [state, setState] = useState<LearnState>(() => {
    if (initialCatalog?.cards.length) return { status: "ready", catalog: initialCatalog, fallbackSets: [] };
    return { status: "loading", catalog: null, fallbackSets: [] };
  });
  const [progressStatus, setProgressStatus] = useState(userUid ? "loading" : "ready");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      if (initialCatalog?.cards.length && !userUid) return;
      try {
        // The catalog API can take several seconds on a cold start (Drive
        // snapshot download + per-user progress scan), so allow a generous
        // timeout before falling back to the "progress unavailable" notice.
        const catalogJson = await fetchWithTimeout("/api/dautoeic/vocab/catalog", { cache: "no-store", signal: controller.signal }, 20_000)
            .then((response) => response.json() as Promise<ApiEnvelope<DauToeicVocabCatalogView>>)
            .catch(() => null);
        if (cancelled) return;
        if (catalogJson?.success && catalogJson.data?.cards.length) {
          if (!cancelled) {
            setState({ status: "ready", catalog: catalogJson.data, fallbackSets: [] });
            setProgressStatus("ready");
          }
          return;
        }
        if (initialCatalog?.cards.length) { setProgressStatus("error"); return; }
        const setsJson = await fetchWithTimeout("/api/vocab/sets", { cache: "no-store", signal: controller.signal }, 8_000)
          .then((response) => response.json() as Promise<ApiEnvelope<VocabSetCard[]>>);
        const sets = setsJson?.success && Array.isArray(setsJson.data) ? setsJson.data : [];
        if (!cancelled) {
          setState({ status: "ready", catalog: null, fallbackSets: sets });
        }
      } catch {
        if (!cancelled) setState({ status: "error", catalog: null, fallbackSets: [] });
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [initialCatalog, userUid]);

  useEffect(() => {
    function syncFromHistory() {
      setSelectedGroupOverride(new URLSearchParams(window.location.search).get("group") ?? undefined);
    }

    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const selectedGroupId = useMemo(() => {
    const catalog = state.catalog;
    if (!catalog?.groups.length) return undefined;
    return selectedGroupOverride && catalog.groups.some((group) => group.id === selectedGroupOverride)
      ? selectedGroupOverride
      : catalog.groups[0]?.id;
  }, [selectedGroupOverride, state.catalog]);

  function selectGroup(nextGroupId: string) {
    setSelectedGroupOverride(nextGroupId);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("tab", "learn");
    nextUrl.searchParams.set("group", nextGroupId);
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}`);
    recordNextPaint("vocab_group_select");
  }

  if (state.status === "loading" && !state.catalog && state.fallbackSets.length === 0) {
    return <LearnSkeleton />;
  }

  if (state.catalog?.cards.length) {
    const cards = selectedGroupId ? state.catalog.cards.filter((card) => card.setId === selectedGroupId) : state.catalog.cards;
    const ready = progressStatus === "ready";
    const status = (card: typeof cards[number]) => card.wordCount > 0 && card.masteredWords >= card.wordCount ? "complete" : card.learnedWords > 0 || card.masteredWords > 0 ? "learning" : "new";
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
    const visible = cards.filter((card) => normalize(card.title + " " + card.setName).includes(normalize(query.trim())) && (!ready || filter === "all" || (filter === "due" ? card.dueWords > 0 : status(card) === filter)));
    if (ready && sort === "progress") visible.sort((left, right) => right.masteredWords / (right.wordCount || 1) - left.masteredWords / (left.wordCount || 1));
    if (sort === "words") visible.sort((left, right) => left.wordCount - right.wordCount);
    const totals = cards.reduce((sum, card) => ({ words: sum.words + card.wordCount, mastered: sum.mastered + card.masteredWords, due: sum.due + card.dueWords }), { words: 0, mastered: 0, due: 0 });
    const resume = ready ? cards.find((card) => status(card) === "learning") : undefined;
    const next = resume ?? (ready ? cards.find((card) => status(card) !== "complete") ?? cards.find((card) => card.masteredWords > 0) : cards[0]);
    const nextIntent = ready && next && status(next) === "complete" ? "review" : "continue";
    const statusLabel = { new: "Mới", learning: "Đang học", complete: "Đã thuộc" };
    const filters = [{ id: "all", label: "Tất cả" }, { id: "new", label: "Chưa học" }, { id: "learning", label: "Đang học" }, { id: "complete", label: "Đã thuộc" }, { id: "due", label: "Cần ôn" }];
    function clearFilters() { setFilter("all"); setQuery(""); }
    return <section>
      <div className={vocabStyles.catalogIntro}>
        <div>
          <span className={vocabStyles.eyebrow}>HỌC ÍT MỖI NGÀY · NHỚ LÂU HƠN</span>
          <h2>Kho từ vựng của bạn</h2>
          <p>Xem từ, học trong ngữ cảnh, rồi thử sức với trò chơi.</p>
        </div>
        <div className={vocabStyles.catalogSummary}>
          <button
            type="button"
            onClick={() => setFilter("learning")}
            className="text-left hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-none p-0 text-inherit"
            title="Xem các bộ đang học có từ đã thuộc"
          >
            <span><strong>{ready ? totals.mastered : "—"}</strong> từ đã thuộc</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("due")}
            className="text-left hover:opacity-80 transition-opacity cursor-pointer bg-transparent border-none p-0 text-inherit"
            title="Lọc các bộ có từ cần ôn"
          >
            <span><strong>{ready ? totals.due : "—"}</strong> cần ôn</span>
          </button>
          {next && <Link className={`${vocabStyles.button} ${vocabStyles.primary} ${vocabStyles.catalogSummaryAction}`} href={studyHref(next.internalSetId, nextIntent)}>{nextIntent === "review" ? "Ôn lại" : resume ? "Tiếp tục học" : "Bắt đầu học"} →</Link>}
        </div>
      </div>
      <div className={styles.sectionLabel}><span className={styles.eyebrow}>01 / CHỌN BỘ ĐỀ</span><span>Một ít mỗi ngày, nhớ lâu hơn</span></div>
      <nav className={styles.filters} aria-label="Nhóm từ vựng">{state.catalog.groups.map((group) => <button key={group.id} type="button" onClick={() => selectGroup(group.id)} aria-pressed={group.id === selectedGroupId}>{group.name}<span>{group.count}</span></button>)}</nav>
      <section className={styles.library} aria-label="Danh sách bộ từ">
        <div className={styles.libraryHeading}><div><span className={styles.eyebrow}>02 / BỘ TỪ CỦA BẠN</span><h2>{state.catalog.groups.find((group) => group.id === selectedGroupId)?.name ?? "Thư viện từ vựng"}</h2></div><p className={styles.catalogTotal}><strong>{cards.length}</strong> bộ từ<span>·</span><strong>{totals.words}</strong> từ vựng</p></div>
        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Lọc theo tiến độ">
            {filters.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={(ready ? filter : "all") === entry.id}
                disabled={entry.id !== "all" && !ready}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className={styles.tools}><label className={styles.search}><Icon name="search" /><input aria-label="Tìm bộ từ" placeholder="Tìm tên bộ từ..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={styles.sort}><span>Sắp xếp</span><select aria-label="Sắp xếp bộ từ" value={sort} onChange={(event) => setSort(event.target.value)}><option value="catalog">Theo thư viện</option><option value="progress" disabled={!ready}>Tiến độ cao nhất</option><option value="words">Ít từ trước</option></select></label></div>
        </div>
        <div className={vocabStyles.catalogStatus}>
          {!ready && <p role="status">{progressStatus === "loading" ? "Đang tải tiến độ..." : "Chưa tải được tiến độ. Bạn vẫn có thể vào học ngay."}</p>}
        </div>
        <p className={styles.resultCount} aria-live="polite">Hiển thị {visible.length}/{cards.length} bộ từ</p>
        <div className={vocabStyles.catalogGrid}>{visible.map((card) => {
          const percent = card.wordCount > 0 ? Math.min(100, Math.round(card.masteredWords / card.wordCount * 100)) : 0;
          const complete = ready && status(card) === "complete";
          return <article key={card.id} className={vocabStyles.catalogCard}>
            <div className={vocabStyles.catalogTop}><span>{card.setName}</span><small>{ready ? statusLabel[status(card)] : "Sẵn sàng học"}</small></div>
            <h3>{card.title}</h3>
            <p>{ready && card.masteredWords > 0 ? `${card.masteredWords}/${card.wordCount} từ đã thuộc` : `${card.wordCount} từ vựng`}{ready && card.dueWords > 0 && <b> · {card.dueWords} cần ôn</b>}</p>
            <div className={vocabStyles.progress} role="progressbar" aria-label={`Từ đã thuộc: ${card.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ready ? percent : undefined}><span style={{ transform: `scaleX(${ready ? percent / 100 : 0})` }} /></div>
            <footer className={vocabStyles.catalogActions}>
              <Link href={`/vocab/dautoeic/${encodeURIComponent(card.id)}?tab=view`} data-action="view"><Icon name="book" />Xem từ</Link>
              <Link href={studyHref(card.internalSetId, complete ? "review" : "continue")} data-overdelay="Đang mở bộ từ vựng..." data-action="learn"><Icon name="spark" />{complete ? "Ôn lại" : ready && status(card) === "learning" ? "Học tiếp" : "Học"}</Link>
              {ready && card.masteredWords > 0 && !complete ? <Link href={studyHref(card.internalSetId, "review")} data-action="review"><Icon name="book" />Ôn lại</Link> : <span className={vocabStyles.catalogActionSlot} aria-hidden="true" />}
              <Link href={`/vocab/dautoeic/${encodeURIComponent(card.id)}?tab=play`} data-action="play"><Icon name="arrow" />Chơi</Link>
            </footer>
          </article>;
        })}</div>
        {!visible.length && (
          <LearningEmpty
            title={filter === "complete" ? "Chưa có bộ từ hoàn thành 100%" : filter === "due" ? "Chưa có từ nào cần ôn" : "Chưa tìm thấy bộ từ phù hợp"}
            description={
              filter === "complete" && totals.mastered > 0
                ? `Bạn đã thuộc ${totals.mastered} từ trong các bộ đang học (xem trong mục 'Đang học'). Bộ từ sẽ hiển thị tại đây khi bạn hoàn thành 100% toàn bộ từ vựng.`
                : "Thử một tên khác hoặc bỏ bộ lọc để khám phá thư viện."
            }
            onReset={clearFilters}
          />
        )}
      </section>
      <LearningTip title="Học vui hơn, nhớ lâu hơn">Xem từ và nghe phát âm trước, rồi thử flashcard hoặc trò chơi để tự kiểm tra. Ưu tiên các từ đến hạn ôn thay vì chỉ học từ mới.</LearningTip>
    </section>;
  }

  if (state.fallbackSets.length > 0) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.fallbackSets.map((set) => (
          <article key={set.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xl font-extrabold text-primary">
                {set.icon || "*"}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-primary">{set.topic}</p>
                <h2 className="mt-1 line-clamp-2 text-lg font-extrabold text-ink">{set.title}</h2>
                <p className="mt-2 text-sm text-muted">
                  {set.wordCount} từ{set.level ? ` · ${set.level}` : ""}
                </p>
              </div>
            </div>
            <div className={vocabStyles.catalogActions}>{([{ tab: "view", label: "Xem từ" }, { tab: "learn", label: "Học" }, { tab: "play", label: "Chơi" }] as const).map((action) => <Link key={action.tab} data-action={action.tab} href={action.tab === "learn" ? studyHref(set.id, "continue") : `/vocab/${set.id}/flashcards?mode=menu&tab=${action.tab}&mastery=all&amount=all`}>{action.label}</Link>)}</div>
          </article>
        ))}
      </section>
    );
  }

  return (
    <EmptyPanel
      title={state.status === "error" ? "Chưa tải được bộ từ gợi ý" : "Chưa có bộ từ gợi ý"}
      description="Bạn vẫn có thể vào mục Từ vựng của tôi để tạo bộ riêng, nhập file và luyện tập với các chế độ game."
    />
  );
}

function LearnSkeleton() {
  return <VocabCatalogSkeleton />;
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return <LearningEmpty title={title} description={description} />;
}
