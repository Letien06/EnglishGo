"use client";

/**
 * VocabSetDetailClient — Word table with search/filter + AI word generation modal.
 *
 * Port of set-detail.html interactive sections.
 */
import { useState, useMemo } from "react";
import type { VocabWordCard, AiVocabCandidate } from "@/types/vocab";

interface Props {
  setId: number;
  words: VocabWordCard[];
  isOwner: boolean;
}

export default function VocabSetDetailClient({ setId, words: initialWords, isOwner }: Props) {
  const [words, setWords] = useState(initialWords);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "mastered" | "learning">("all");
  const [showAiModal, setShowAiModal] = useState(false);

  const filtered = useMemo(() => {
    return words.filter((w) => {
      const q = search.toLowerCase();
      const matchesText =
        !q ||
        w.word.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "mastered" && w.mastered) ||
        (filter === "learning" && !w.mastered);
      return matchesText && matchesFilter;
    });
  }, [words, search, filter]);

  function speak(text: string) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(cleanSpeechText(text)));
    }
  }

  function playWord(word: VocabWordCard, accent: "us" | "uk" = "us") {
    const audioUrl =
      accent === "uk"
        ? word.audioUkUrl || word.audioUrl || word.audioUsUrl
        : word.audioUsUrl || word.audioUrl || word.audioUkUrl;
    if (audioUrl) {
      new Audio(audioUrl).play().catch(() => speak(word.word));
      return;
    }
    speak(word.word);
  }

  async function toggleMaster(wordId: number) {
    const res = await fetch(`/api/vocab/words/${wordId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quality: 5 }),
    });
    if (res.status === 401) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, mastered: true } : w)),
    );
  }

  return (
    <>
      {/* Toolbar */}
      <section className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm từ..."
          className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-surface border border-line text-ink text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="px-3 py-2 rounded-lg bg-surface border border-line text-ink text-sm"
        >
          <option value="all">Tất cả</option>
          <option value="mastered">Thành thạo</option>
          <option value="learning">Đang học</option>
        </select>
        {isOwner && (
          <button
            onClick={() => setShowAiModal(true)}
            className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 text-sm font-semibold hover:bg-purple-500/30 transition-colors"
          >
            🤖 AI tạo từ
          </button>
        )}
      </section>

      {/* Word table */}
      <section className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted uppercase tracking-wider">
              <th className="pb-3 pr-4">#</th>
              <th className="pb-3 pr-4">Từ vựng</th>
              <th className="pb-3 pr-4">Phiên âm</th>
              <th className="pb-3 pr-4">Nghĩa</th>
              <th className="pb-3 pr-4">Loại từ</th>
              <th className="pb-3 pr-4">Ví dụ</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((word, i) => (
              <tr
                key={word.id}
                className="border-b border-line/50 hover:bg-surface-soft/50"
              >
                <td className="py-3 pr-4 text-muted">{i + 1}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => playWord(word, "us")}
                      className="text-accent hover:text-accent/80 shrink-0"
                      title="Phát âm"
                    >
                      🔊
                    </button>
                    <span className="font-semibold text-ink">{word.word}</span>
                    <button
                      onClick={() => playWord(word, "uk")}
                      className="text-accent hover:text-accent/80 shrink-0 text-xs font-bold"
                      title="Phat am UK"
                    >
                      UK
                    </button>
                  </div>
                </td>
                <td className="py-3 pr-4 text-muted text-xs">
                  {word.phoneticUs || word.phoneticUk ? (
                    <span className="space-y-1">
                      {word.phoneticUs && <span className="block">US {word.phoneticUs}</span>}
                      {word.phoneticUk && <span className="block">UK {word.phoneticUk}</span>}
                    </span>
                  ) : (
                    word.phonetic
                  )}
                </td>
                <td className="py-3 pr-4 text-ink2">{word.meaning}</td>
                <td className="py-3 pr-4">
                  {word.partOfSpeech && (
                    <span className="px-2 py-0.5 rounded bg-surface-soft text-xs text-muted">
                      {word.partOfSpeech}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-muted text-xs italic max-w-[250px] truncate">
                  {word.example}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => toggleMaster(word.id)}
                    className={`text-xs px-2 py-1 rounded font-semibold transition-colors ${
                      word.mastered
                        ? "bg-green-500/20 text-green-400"
                        : "bg-surface-soft text-muted hover:text-ink"
                    }`}
                  >
                    {word.mastered ? "⭐ Thành thạo" : "Đánh dấu"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted">
            {words.length === 0
              ? "Bộ từ này chưa có từ vựng nào."
              : "Không tìm thấy từ nào phù hợp."}
          </div>
        )}
      </section>

      {/* AI Modal */}
      {showAiModal && (
        <AiWordModal
          setId={setId}
          onClose={() => setShowAiModal(false)}
          onSaved={(newWords) => {
            setWords((prev) => [...prev, ...newWords]);
            setShowAiModal(false);
          }}
        />
      )}
    </>
  );
}

/* ================================================================== */
/*  AI Word Generation Modal                                           */
/* ================================================================== */

function AiWordModal({
  setId,
  onClose,
  onSaved,
}: {
  setId: number;
  onClose: () => void;
  onSaved: (words: VocabWordCard[]) => void;
}) {
  const [mode, setMode] = useState<"text" | "reading" | "image">("text");
  const [input, setInput] = useState("");
  const [count, setCount] = useState(10);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [candidates, setCandidates] = useState<AiVocabCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function preview() {
    setLoading(true);
    setStatus("Gemini đang phân tích...");
    setCandidates([]);

    let imageData: string | undefined;
    if (mode === "image" && imageFile) {
      imageData = await fileToBase64(imageFile);
    }

    try {
      const res = await fetch(`/api/vocab/sets/${setId}/ai-words/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, input, count, image: imageData }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setCandidates(data.data);
        setSelected(new Set(data.data.map((_: AiVocabCandidate, i: number) => i)));
        setStatus(`Tìm thấy ${data.data.length} từ vựng`);
      } else {
        setStatus(data.error || "Có lỗi xảy ra");
      }
    } catch {
      setStatus("Lỗi kết nối server");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const toSave = candidates.filter((_, i) => selected.has(i));
    if (!toSave.length) return;

    setLoading(true);
    setStatus("Đang lưu...");

    try {
      const res = await fetch(`/api/vocab/sets/${setId}/ai-words/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: toSave }),
      });
      const data = await res.json();
      if (data.success) {
        // Map candidates to word cards for the parent
        const newCards: VocabWordCard[] = toSave.map((c, i) => ({
          id: Date.now() + i, // temporary ID, will refresh
          word: c.word,
          meaning: c.meaning,
          partOfSpeech: c.partOfSpeech,
          phonetic: c.phonetic,
          phoneticUs: c.phoneticUs,
          phoneticUk: c.phoneticUk,
          example: c.example,
          audioUrl: c.audioUrl,
          audioUsUrl: c.audioUsUrl,
          audioUkUrl: c.audioUkUrl,
          mastered: false,
        }));
        onSaved(newCards);
      } else {
        setStatus(data.error || "Lỗi khi lưu");
        setLoading(false);
      }
    } catch {
      setStatus("Lỗi kết nối server");
      setLoading(false);
    }
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((_, i) => i)));
    }
  }

  function speak(word: string) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(cleanSpeechText(word)));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-surface border border-line shadow-xl p-6 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink text-lg">🤖 AI Tạo từ vựng</h3>
            <p className="text-xs text-muted">
              Gemini sẽ tạo từ vựng và xác minh qua từ điển
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink text-xl"
          >
            ×
          </button>
        </header>

        {/* Mode tabs */}
        <div className="flex gap-1">
          {(["text", "reading", "image"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === m
                  ? "bg-purple-500/20 text-purple-300"
                  : "bg-surface-soft text-ink2"
              }`}
            >
              {m === "text" && "📝 Chủ đề"}
              {m === "reading" && "📖 Đoạn văn"}
              {m === "image" && "🖼️ Hình ảnh"}
            </button>
          ))}
        </div>

        {/* Input area */}
        {mode !== "image" ? (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder={
              mode === "reading"
                ? "Paste đoạn văn tiếng Anh để Gemini trích xuất từ vựng..."
                : "Nhập chủ đề, ví dụ: workplace communication, business planning..."
            }
            className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm"
          />
        ) : (
          <div className="text-center py-4">
            <label className="cursor-pointer inline-block px-8 py-6 rounded-xl border-2 border-dashed border-line hover:border-purple-500/40 transition-colors">
              {imageFile ? (
                <p className="text-sm text-ink">{imageFile.name}</p>
              ) : (
                <>
                  <p className="text-2xl mb-1">🖼️</p>
                  <p className="text-sm text-muted">
                    Chọn ảnh JPG, PNG hoặc WEBP (tối đa 5MB)
                  </p>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Count */}
        <label className="flex items-center gap-2 text-sm text-ink2">
          Số lượng từ:
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            min={1}
            max={50}
            className="w-16 px-2 py-1 rounded bg-surface-soft border border-line text-ink text-sm"
          />
        </label>

        {/* Status */}
        {status && (
          <p className={`text-sm ${loading ? "text-muted animate-pulse" : "text-ink2"}`}>
            {status}
          </p>
        )}

        {/* Candidates */}
        {candidates.length > 0 && (
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h4 className="font-semibold text-ink text-sm">
                Từ vựng đã tạo ({selected.size}/{candidates.length})
              </h4>
              <button
                onClick={toggleAll}
                className="text-xs text-accent font-semibold"
              >
                {selected.size === candidates.length
                  ? "Bỏ chọn tất cả"
                  : "Chọn tất cả"}
              </button>
            </header>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {candidates.map((c, i) => (
                <article
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                    selected.has(i)
                      ? "bg-purple-500/5 border-purple-500/20"
                      : "bg-surface border-line opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleSelect(i)}
                    className="mt-1 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{c.word}</span>
                      {c.phonetic && (
                        <span className="text-xs text-muted">{c.phonetic}</span>
                      )}
                      {c.partOfSpeech && (
                        <span className="px-1.5 py-0.5 rounded bg-surface-soft text-xs text-muted">
                          {c.partOfSpeech}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink2 mt-0.5">{c.meaning}</p>
                    {c.example && (
                      <p className="text-xs text-muted italic mt-0.5">
                        &quot;{c.example}&quot;
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => speak(c.word)}
                    className="text-accent shrink-0"
                    title="Phát âm"
                  >
                    🔊
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        <footer className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-soft text-ink2 text-sm"
          >
            Đóng
          </button>
          {candidates.length === 0 ? (
            <button
              onClick={preview}
              disabled={loading || (mode !== "image" && !input.trim()) || (mode === "image" && !imageFile)}
              className="px-4 py-2 rounded-lg bg-purple-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Đang tạo..." : "🤖 Tạo từ vựng"}
            </button>
          ) : (
            <button
              onClick={save}
              disabled={loading || selected.size === 0}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Đang lưu..." : `Lưu ${selected.size} từ`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function cleanSpeechText(value: string): string {
  return value
    .trim()
    .replace(/\s*\((?:n|noun|v|verb|adj|adjective|adv|adverb|prep|preposition)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data:image/...;base64, prefix
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}
