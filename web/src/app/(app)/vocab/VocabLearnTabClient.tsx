"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DauToeicVocabCatalogView } from "@/types/dautoeic";
import type { VocabSetCard } from "@/types/vocab";
import { recordNextPaint } from "@/lib/client-request";

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

type LearnState =
  | { status: "loading"; catalog: DauToeicVocabCatalogView | null; fallbackSets: VocabSetCard[] }
  | { status: "ready"; catalog: DauToeicVocabCatalogView | null; fallbackSets: VocabSetCard[] }
  | { status: "error"; catalog: null; fallbackSets: VocabSetCard[] };

const catalogCache: { value: DauToeicVocabCatalogView | null } = { value: null };
const fallbackSetCache: { value: VocabSetCard[] | null } = { value: null };

export default function VocabLearnTabClient({ groupId }: { groupId?: string }) {
  const [selectedGroupOverride, setSelectedGroupOverride] = useState<string | undefined>(groupId);
  const [state, setState] = useState<LearnState>(() => {
    if (catalogCache.value) {
      return { status: "ready", catalog: catalogCache.value, fallbackSets: fallbackSetCache.value ?? [] };
    }
    if (fallbackSetCache.value) {
      return { status: "ready", catalog: null, fallbackSets: fallbackSetCache.value };
    }
    return { status: "loading", catalog: null, fallbackSets: [] };
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (catalogCache.value || fallbackSetCache.value) return;
      setState({ status: "loading", catalog: null, fallbackSets: [] });
      try {
        // Load the local fallback alongside the external catalog. Previously a
        // slow/unavailable DauToeic API delayed the fallback by another full
        // request, making the Learn tab wait several seconds before rendering.
        const [catalogJson, setsJson] = await Promise.all([
          fetch("/api/dautoeic/vocab/catalog", { cache: "no-store" })
            .then((response) => response.json() as Promise<ApiEnvelope<DauToeicVocabCatalogView>>)
            .catch(() => null),
          fetch("/api/vocab/sets", { cache: "force-cache" })
            .then((response) => response.json() as Promise<ApiEnvelope<VocabSetCard[]>>)
            .catch(() => null),
        ]);
        if (catalogJson?.success && catalogJson.data?.cards.length) {
          catalogCache.value = catalogJson.data;
          if (!cancelled) {
            setState({ status: "ready", catalog: catalogJson.data, fallbackSets: [] });
          }
          return;
        }

        const sets = setsJson?.success && Array.isArray(setsJson.data) ? setsJson.data : [];
        fallbackSetCache.value = sets;
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
    };
  }, []);

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
    const cards = selectedGroupId
      ? state.catalog.cards.filter((card) => card.setId === selectedGroupId)
      : state.catalog.cards;

    return (
      <section className="space-y-5">
        <nav className="flex max-w-full gap-2 overflow-x-auto" aria-label="Vocabulary groups">
          {state.catalog.groups.map((group) => {
            const selected = group.id === selectedGroupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => selectGroup(group.id)}
                aria-pressed={selected}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-extrabold transition-colors ${
                  selected
                    ? "border-primary bg-primary text-gold-ink"
                    : "border-sky-200 bg-white text-primary hover:bg-sky-50"
                }`}
              >
                {group.name} ({group.count})
              </button>
            );
          })}
        </nav>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const percent = card.wordCount > 0
              ? Math.round((card.masteredWords / card.wordCount) * 100)
              : 0;
            return (
              <article key={card.id} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-extrabold text-indigo-700">
                      {card.setName}
                    </span>
                    <h2 className="mt-4 line-clamp-2 text-lg font-extrabold text-ink">
                      {card.title}
                    </h2>
                  </div>
                </header>
                <p className="mt-3 text-sm text-muted">{card.wordCount} từ vựng</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted">
                  <span>{card.masteredWords}/{card.wordCount} từ đã thuộc</span>
                  {card.dueWords > 0 ? <span className="text-red-600">{card.dueWords} cần ôn</span> : null}
                </div>
                <Link
                  href={`/vocab/dautoeic/${encodeURIComponent(card.id)}`}
                  data-overdelay="Đang mở bộ từ vựng..."
                  className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-emerald-300 px-4 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50"
                >
                  Vào học
                </Link>
              </article>
            );
          })}
        </section>
      </section>
    );
  }

  if (state.fallbackSets.length > 0) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.fallbackSets.map((set) => (
          <article key={set.id} className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xl font-extrabold text-primary">
                {set.icon || "*"}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-primary">{set.topic}</p>
                <h2 className="mt-1 line-clamp-2 text-lg font-extrabold text-ink">{set.title}</h2>
                <p className="mt-2 text-sm text-muted">
                  {set.wordCount} tu{set.level ? ` · ${set.level}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/vocab/${set.id}`}
                data-overdelay="Đang mở chi tiết bộ từ..."
                className="rounded-full border border-amber-200 px-4 py-2 text-xs font-extrabold text-ink hover:bg-amber-50"
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
  return (
    <section className="space-y-5">
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className="h-9 w-28 animate-pulse rounded-full bg-white" />
        ))}
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <article key={index} className="h-44 animate-pulse rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
            <div className="h-5 w-28 rounded-full bg-slate-100" />
            <div className="mt-5 h-5 w-3/4 rounded bg-slate-100" />
            <div className="mt-4 h-3 w-20 rounded bg-slate-100" />
            <div className="mt-5 h-9 rounded-full bg-slate-100" />
          </article>
        ))}
      </section>
    </section>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex min-h-52 items-center justify-center rounded-xl border border-amber-100 bg-white p-8 text-center shadow-sm">
      <div>
        <div className="mx-auto mb-5 text-3xl text-amber-200">*</div>
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        <p className="mt-3 max-w-xl text-sm text-muted">{description}</p>
      </div>
    </section>
  );
}
