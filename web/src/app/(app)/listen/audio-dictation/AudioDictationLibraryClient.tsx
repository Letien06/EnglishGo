"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DictationCatalog } from "@/lib/storage/dictation-snapshot";

type SetEntry = DictationCatalog["sets"][number];

export default function AudioDictationLibraryClient({
  sets,
  learnerId,
}: {
  sets: SetEntry[];
  learnerId: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedPart, setSelectedPart] = useState<number | "all">("all");
  const [completedCountBySet, setCompletedCountBySet] = useState<Record<string, number>>({});

  useEffect(() => {
    function refresh() {
      const counts: Record<string, number> = {};
      try {
        for (const set of sets) {
          const raw = localStorage.getItem(`englishweb:audio-dictation:v1:${learnerId}:${set.id}`);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { completed?: unknown };
          if (Array.isArray(parsed?.completed)) {
            counts[set.id] = new Set(parsed.completed.filter((id): id is string => typeof id === "string")).size;
          }
        }
      } catch {
        // Ignore storage errors in private browsers.
      }
      setCompletedCountBySet(counts);
    }
    refresh();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [learnerId, sets]);

  const parts = useMemo(
    () => [...new Set(sets.map((s) => s.part).filter((p): p is number => typeof p === "number"))].sort((a, b) => a - b),
    [sets],
  );

  const filteredSets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sets.filter((set) => {
      if (selectedPart !== "all" && set.part !== selectedPart) return false;
      if (!q) return true;
      const text = `${set.collectionName ?? ""} ${set.chapterName ?? ""} ${set.subtitle ?? ""} ${set.name}`.toLowerCase();
      return text.includes(q);
    });
  }, [query, selectedPart, sets]);

  const groups = useMemo(() => {
    const map = new Map<string, SetEntry[]>();
    for (const set of filteredSets) {
      const name = set.collectionName || "Nghe chép";
      map.set(name, [...(map.get(name) || []), set]);
    }
    return [...map.entries()];
  }, [filteredSets]);

  return (
    <>
      {sets.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm bộ nghe chép theo tên hoặc chủ đề..."
            aria-label="Tìm bộ nghe chép"
            className="min-w-[220px] flex-1 rounded-xl border border-line bg-surface-soft px-3.5 py-2 text-sm text-ink outline-none focus:border-primary"
          />
          {parts.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo Part">
              <button
                type="button"
                onClick={() => setSelectedPart("all")}
                className={`rounded-xl px-3 py-1.5 text-xs font-extrabold ${
                  selectedPart === "all" ? "bg-primary text-gold-ink" : "border border-line bg-surface-soft text-muted"
                }`}
              >
                Tất cả
              </button>
              {parts.map((part) => (
                <button
                  key={part}
                  type="button"
                  onClick={() => setSelectedPart(part)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-extrabold ${
                    selectedPart === part ? "bg-primary text-gold-ink" : "border border-line bg-surface-soft text-muted"
                  }`}
                >
                  Part {part}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {groups.map(([name, items]) => (
        <section key={name} className="mt-8">
          <h2 className="mb-4 text-xl font-extrabold text-ink">{name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((set) => {
              const completed = Math.min(set.itemCount, completedCountBySet[set.id] ?? 0);
              const percent = set.itemCount > 0 ? Math.round((completed * 100) / set.itemCount) : 0;
              const isDone = set.itemCount > 0 && completed >= set.itemCount;
              return (
                <Link
                  key={set.id}
                  href={`/listen/audio-dictation/${set.id}`}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 text-ink no-underline shadow-sm transition hover:border-primary"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-primary">
                        {set.chapterName}
                        {set.part ? ` · Part ${set.part}` : ""}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                          isDone
                            ? "bg-emerald-100 text-emerald-800"
                            : completed > 0
                              ? "bg-teal-soft text-teal-ink"
                              : "bg-surface-soft text-muted"
                        }`}
                      >
                        {isDone ? "Hoàn thành" : completed > 0 ? "Đang học" : "Mới"}
                      </span>
                    </div>
                    <h3 className="mt-2 font-extrabold">{set.subtitle || set.name}</h3>
                  </div>

                  <div className="mt-4">
                    {completed > 0 ? (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
                          <div className="h-full rounded-full bg-teal-500" style={{ width: `${percent}%` }} />
                        </div>
                        <p className="mt-2 text-xs font-bold text-teal-ink">
                          {completed}/{set.itemCount} câu đã chép · {isDone ? "Ôn lại →" : "Học tiếp →"}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted">{set.itemCount} câu · Luyện tập →</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
