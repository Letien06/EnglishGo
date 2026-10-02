"use client";

import Link from "@/components/IntentLink";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DauToeicVocabCatalogView } from "@/types/dautoeic";
import type { VocabSetCard } from "@/types/vocab";
import { LearningHero, LearningTip, LearningEmpty } from "../_components/LearningDashboardUI";
import Icon from "../listen/_components/ListeningIcon";
import { ListeningProgressRing } from "../listen/_components/ListeningTestCard";
import { ListeningGridSkeleton } from "../listen/_components/ListeningLoading";
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
        const catalogJson = await fetchWithTimeout("/api/dautoeic/vocab/catalog", { cache: "no-store", signal: controller.signal }, 8_000)
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
    const resume = ready ? cards.find((card) => card.dueWords > 0) ?? cards.find((card) => status(card) === "learning") : undefined;
    const next = resume ?? cards[0];
    const statusLabel = { new: "Mới", learning: "Đang học", complete: "Đã thuộc" };
    const filters = [{ id: "all", label: "Tất cả" }, { id: "new", label: "Chưa học" }, { id: "learning", label: "Đang học" }, { id: "complete", label: "Đã thuộc" }, { id: "due", label: "Cần ôn" }];
    function clearFilters() { setFilter("all"); setQuery(""); }
    return <section>
      <LearningHero icon="book" title={resume ? "Giữ nhịp học. Nhớ lâu hơn." : "Thêm một từ, mở thêm cơ hội."}
        description={next ? `${next.setName} · ${next.title} · ${next.wordCount} từ vựng` : "Chọn một bộ từ và bắt đầu bằng chế độ yêu thích."}
        href={next ? `/vocab/dautoeic/${encodeURIComponent(next.id)}` : undefined} cta={resume ? "Tiếp tục học" : "Khám phá bộ từ"} note="Xem từ · Flashcard · Trò chơi"
        stats={[
          { label: "Kho từ đang chọn", value: totals.words, unit: "từ", detail: `${cards.length} bộ từ để khám phá`, icon: "book" },
          { label: "Từ đã thuộc", value: ready ? totals.mastered : "—", unit: "từ", detail: "Theo tiến độ ghi nhớ của bạn", icon: "check" },
          { label: "Đến lúc ôn", value: ready ? totals.due : "—", unit: "từ", detail: "Ôn đúng lúc để nhớ lâu hơn", icon: "clock" },
        ]} />
      <div className={styles.sectionLabel}><span className={styles.eyebrow}>01 / CHỌN BỘ ĐỀ</span><span>Một ít mỗi ngày, nhớ lâu hơn</span></div>
      <nav className={styles.filters} aria-label="Nhóm từ vựng">{state.catalog.groups.map((group) => <button key={group.id} type="button" onClick={() => selectGroup(group.id)} aria-pressed={group.id === selectedGroupId}>{group.name}<span>{group.count}</span></button>)}</nav>
      <section className={styles.library} aria-label="Danh sách bộ từ">
        <div className={styles.libraryHeading}><div><span className={styles.eyebrow}>02 / BỘ TỪ CỦA BẠN</span><h2>{state.catalog.groups.find((group) => group.id === selectedGroupId)?.name ?? "Thư viện từ vựng"}</h2></div><p className={styles.catalogTotal}><strong>{cards.length}</strong> bộ từ<span>·</span><strong>{totals.words}</strong> từ vựng</p></div>
        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Lọc theo tiến độ">{filters.map((entry) => <button key={entry.id} type="button" aria-pressed={(ready ? filter : "all") === entry.id} disabled={entry.id !== "all" && !ready} onClick={() => setFilter(entry.id)}>{entry.label}</button>)}</div>
          <div className={styles.tools}><label className={styles.search}><Icon name="search" /><input aria-label="Tìm bộ từ" placeholder="Tìm tên bộ từ..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className={styles.sort}><span>Sắp xếp</span><select aria-label="Sắp xếp bộ từ" value={sort} onChange={(event) => setSort(event.target.value)}><option value="catalog">Theo thư viện</option><option value="progress" disabled={!ready}>Tiến độ cao nhất</option><option value="words">Ít từ trước</option></select></label></div>
        </div>
        {!ready && <p className={styles.notice} role="status">{progressStatus === "loading" ? "Đang tải tiến độ..." : "Chưa tải được tiến độ. Bạn vẫn có thể vào học ngay."}</p>}
        <p className={styles.resultCount} aria-live="polite">Hiển thị {visible.length}/{cards.length} bộ từ</p>
        <div className={styles.grid}>{visible.map((card, index) => {
          const percent = card.wordCount > 0 ? Math.min(100, Math.round(card.masteredWords / card.wordCount * 100)) : 0;
          return <article key={card.id} className={styles.card} data-status={ready ? status(card) : "unknown"} style={{ "--card-delay": `${Math.min(index, 5) * 35}ms` } as CSSProperties}>
            <div className={styles.cardTop}><span className={styles.cardLabel}>{card.setName}</span><span className={styles.badge} data-status={ready ? status(card) : "unknown"}><span />{ready ? statusLabel[status(card)] : "Chưa có tiến độ"}</span></div>
            <div className={styles.cardHeading}><div><h2>{card.title}</h2><p>{card.wordCount} từ vựng</p></div><ListeningProgressRing percent={percent} ready={ready} label={`Từ đã thuộc: ${card.title}`} /></div>
            <div className={styles.answerStats}><span data-tone="good"><i /><strong>{ready ? card.masteredWords : "—"}</strong> đã thuộc</span><span data-tone="bad"><i /><strong>{ready ? card.dueWords : "—"}</strong> cần ôn</span><span><i /><strong>{ready ? Math.max(0, card.wordCount - card.masteredWords) : "—"}</strong> chưa thuộc</span></div>
            <div className={styles.metadata}><span><Icon name="book" />{card.partCount} phần học</span><span><Icon name="spark" />Flashcard & trò chơi</span></div>
            <footer className={styles.cardFooter}><Link href={`/vocab/dautoeic/${encodeURIComponent(card.id)}`} data-overdelay="Đang mở bộ từ vựng..." className={styles.cardCta}>Vào học<Icon name="arrow" /></Link></footer>
          </article>;
        })}</div>
        {!visible.length && <LearningEmpty title="Chưa tìm thấy bộ từ phù hợp" description="Thử một tên khác hoặc bỏ bộ lọc để khám phá thư viện." onReset={clearFilters} />}
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
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/vocab/${set.id}`}
                data-overdelay="Đang mở chi tiết bộ từ..."
                className="rounded-full border border-line px-4 py-2 text-xs font-extrabold text-ink hover:bg-surface-soft"
              >
                Xem chi tiết
              </Link>
              <Link
                href={`/vocab/${set.id}/flashcards?mode=menu`}
                data-overdelay="Đang nạp game từ vựng..."
                className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink hover:opacity-90"
              >
                Chọn chế độ học
              </Link>
            </div>
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
  return <ListeningGridSkeleton />;
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return <LearningEmpty title={title} description={description} />;
}
