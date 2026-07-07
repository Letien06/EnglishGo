"use client";

/**
 * VocabMyTab — "Bộ từ của tôi" tab (client component for modal/form interactivity).
 *
 * Port of sets.html "my" tab section.
 */
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import type {
  AiVocabCandidate,
  MyVocabSetCard,
  MyVocabFolderCard,
} from "@/types/vocab";

interface Props {
  uid: string;
  folderId?: number;
  folderSearch?: string;
}

const myTabCache = new Map<string, {
  sets: MyVocabSetCard[];
  folders: MyVocabFolderCard[];
}>();

export default function VocabMyTab({ uid, folderId, folderSearch }: Props) {
  const cacheKey = `${uid || "guest"}:${folderId ?? "all"}:${folderSearch ?? ""}`;
  const cached = myTabCache.get(cacheKey);
  const [mySets, setMySets] = useState<MyVocabSetCard[]>(cached?.sets ?? []);
  const [myFolders, setMyFolders] = useState<MyVocabFolderCard[]>(cached?.folders ?? []);
  const [loading, setLoading] = useState(!cached);

  /* modals */
  const [showCreateSet, setShowCreateSet] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showAddWords, setShowAddWords] = useState(false);
  const [addWordsSetId, setAddWordsSetId] = useState<number | null>(null);
  const [renameFolder, setRenameFolder] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [renameSet, setRenameSet] = useState<{
    id: number;
    title: string;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!uid) return;
    setLoading(!myTabCache.has(cacheKey));
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", String(folderId));
      if (folderSearch) params.set("q", folderSearch);
      const res = await fetch(`/api/vocab/my${params.size ? `?${params}` : ""}`);
      const data = await res.json();
      const previous = myTabCache.get(cacheKey);
      const nextSets = data.success ? data.data?.sets ?? [] : previous?.sets ?? [];
      const nextFolders = data.success ? data.data?.folders ?? [] : previous?.folders ?? [];
      setMySets(nextSets);
      setMyFolders(nextFolders);
      myTabCache.set(cacheKey, { sets: nextSets, folders: nextFolders });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [uid, folderId, folderSearch, cacheKey]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const next = myTabCache.get(cacheKey);
      if (next) {
        setMySets(next.sets);
        setMyFolders(next.folders);
        setLoading(false);
        return;
      }
      setMySets([]);
      setMyFolders([]);
      setLoading(!!uid);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cacheKey, uid]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  if (!uid) {
    return (
      <div className="text-center py-16 text-muted">
        <p>Đăng nhập để quản lý bộ từ của bạn.</p>
        <Link href="/login" className="text-accent font-semibold">
          Đăng nhập
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-muted animate-pulse">
        Đang tải...
      </div>
    );
  }

  return (
    <section className="space-y-6">
      {/* Hero */}
      <article className="p-6 rounded-2xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-line">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-ink">Bộ từ của tôi</h2>
            <p className="text-sm text-muted">
              Quản lý, tạo mới và nhập từ vựng
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>
              <strong className="text-ink">{mySets.length}</strong> bộ từ
            </span>
            <span>
              <strong className="text-ink">{myFolders.length}</strong> folder
            </span>
          </div>
        </div>
      </article>

      {/* Action bar */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setShowCreateSet(true)}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          + Tạo bộ từ
        </button>
        <button
          onClick={() => setShowCreateFolder(true)}
          className="px-4 py-2 rounded-lg bg-surface border border-line text-ink2 text-sm font-semibold hover:bg-surface-soft transition-colors"
        >
          📁 Tạo folder
        </button>
        {mySets.length > 0 && (
          <button
            onClick={() => {
              setAddWordsSetId(mySets[0].id);
              setShowAddWords(true);
            }}
            className="px-4 py-2 rounded-lg bg-surface border border-line text-ink2 text-sm font-semibold hover:bg-surface-soft transition-colors"
          >
            + Thêm từ
          </button>
        )}
      </div>

      {/* Folders */}
      {myFolders.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/vocab?tab=my"
            data-overdelay="Dang mo tat ca bo tu..."
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors no-underline ${
              !folderId
                ? "bg-accent text-white"
                : "bg-surface border border-line text-ink2 hover:bg-surface-soft"
            }`}
          >
            📋 Tất cả
          </Link>
          {myFolders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-1">
              <Link
                href={`/vocab?tab=my&folderId=${folder.id}`}
                data-overdelay="Dang mo folder..."
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors no-underline ${
                  folderId === folder.id
                    ? "bg-accent text-white"
                    : "bg-surface border border-line text-ink2 hover:bg-surface-soft"
                }`}
              >
                📁 {folder.name}
                {folder.publicShared && " 🌍"}
              </Link>
              <button
                onClick={() =>
                  setRenameFolder({ id: folder.id, name: folder.name })
                }
                className="text-xs text-muted hover:text-ink px-1"
                title="Đổi tên"
              >
                ✏️
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sets grid */}
      {mySets.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-3">📝</p>
          <p>Chưa có bộ từ nào. Tạo bộ từ đầu tiên!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mySets.map((set) => (
            <article
              key={set.id}
              className="p-4 rounded-xl bg-surface border border-line hover:border-accent/40 transition-all"
            >
              <header className="flex items-start justify-between gap-2 mb-3">
                <Link
                  href={`/vocab/${set.id}`}
                  data-overdelay="Dang mo chi tiet bo tu..."
                  className="min-w-0 no-underline"
                >
                  <div className="flex items-center gap-2">
                    <span>{set.icon || "📖"}</span>
                    <h3 className="font-semibold text-ink text-sm truncate">
                      {set.title}
                    </h3>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {set.topic} • {set.wordCount} từ
                  </p>
                </Link>
                <span
                  className="h-5 w-5 shrink-0 rounded-full border-2 border-line"
                  aria-hidden="true"
                />
              </header>

              <footer className="flex items-center gap-2 border-t border-line pt-3">
                <Link
                  href={`/vocab/${set.id}`}
                  data-overdelay="Dang mo chi tiet bo tu..."
                  className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white no-underline"
                >
                  Xem
                </Link>
                <Link
                  href={`/vocab/${set.id}/flashcards?mode=menu`}
                  data-overdelay="Dang nap game tu vung..."
                  className="rounded-full px-3 py-2 text-sm font-bold text-ink2 no-underline hover:bg-surface-soft"
                  title="Chọn 6 game và lịch sử chơi"
                >
                  Play
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setRenameSet({ id: set.id, title: set.title })
                  }
                  className="rounded-full px-3 py-2 text-sm font-bold text-ink2 hover:bg-surface-soft"
                  title="Chỉnh sửa bộ từ"
                >
                  Sửa
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Xóa bộ từ này?")) return;
                    await fetch(`/api/vocab/my-sets/${set.id}`, {
                      method: "DELETE",
                    });
                    reload();
                  }}
                  className="ml-auto rounded-full px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
                  title="Xóa bộ từ"
                >
                  Xóa
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {/* ---- Modals ---- */}
      {showCreateSet && (
        <CreateSetModal
          onClose={() => setShowCreateSet(false)}
          onCreated={reload}
        />
      )}
      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreated={reload}
        />
      )}
      {showAddWords && addWordsSetId && (
        <AddWordsModal
          setId={addWordsSetId}
          allSets={mySets}
          onClose={() => setShowAddWords(false)}
          onAdded={reload}
        />
      )}
      {renameFolder && (
        <RenameFolderModal
          folderId={renameFolder.id}
          currentName={renameFolder.name}
          onClose={() => setRenameFolder(null)}
          onRenamed={reload}
        />
      )}
      {renameSet && (
        <RenameSetModal
          setId={renameSet.id}
          currentTitle={renameSet.title}
          onClose={() => setRenameSet(null)}
          onRenamed={reload}
        />
      )}
    </section>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || result);
    };
    reader.readAsDataURL(file);
  });
}

/* ================================================================== */
/*  Modal components                                                   */
/* ================================================================== */

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-line shadow-xl p-6 space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="font-bold text-ink text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink text-xl leading-none"
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function CreateSetModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState("📖");
  const [busy, setBusy] = useState(false);

  const icons = ["📖", "🎯", "💼", "🧪", "🌍", "✈️", "🍴", "🏥", "⚖️", "🎓", "💻", "🎵"];

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    await fetch("/api/vocab/my-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description: desc, icon }),
    });
    setBusy(false);
    onCreated();
    onClose();
  }

  return (
    <ModalShell title="Tạo bộ từ mới" onClose={onClose}>
      <label className="block text-sm font-semibold text-ink2 mb-1">
        Tên bộ từ *
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ví dụ: Business English"
        className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm"
        autoFocus
      />

      <label className="block text-sm font-semibold text-ink2 mb-1 mt-3">
        Mô tả
      </label>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Mô tả ngắn..."
        className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm"
      />

      <label className="block text-sm font-semibold text-ink2 mb-1 mt-3">
        Icon
      </label>
      <div className="flex gap-2 flex-wrap">
        {icons.map((ic) => (
          <button
            key={ic}
            type="button"
            onClick={() => setIcon(ic)}
            className={`text-xl p-1 rounded ${icon === ic ? "ring-2 ring-accent" : ""}`}
          >
            {ic}
          </button>
        ))}
      </div>

      <footer className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-surface-soft text-ink2 text-sm"
        >
          Hủy
        </button>
        <button
          onClick={submit}
          disabled={busy || !title.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Đang tạo..." : "Tạo"}
        </button>
      </footer>
    </ModalShell>
  );
}

function CreateFolderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/vocab/my-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    onCreated();
    onClose();
  }

  return (
    <ModalShell title="Tạo folder" onClose={onClose}>
      <label className="block text-sm font-semibold text-ink2 mb-1">
        Tên folder *
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ví dụ: TOEIC 900+"
        className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm"
        autoFocus
      />
      <footer className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-surface-soft text-ink2 text-sm"
        >
          Hủy
        </button>
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Đang tạo..." : "Tạo"}
        </button>
      </footer>
    </ModalShell>
  );
}

function RenameFolderModal({
  folderId,
  currentName,
  onClose,
  onRenamed,
}: {
  folderId: number;
  currentName: string;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    await fetch(`/api/vocab/my-folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    onRenamed();
    onClose();
  }

  return (
    <ModalShell title="Đổi tên folder" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm"
        autoFocus
      />
      <footer className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-surface-soft text-ink2 text-sm"
        >
          Hủy
        </button>
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Đang lưu..." : "Lưu"}
        </button>
      </footer>
    </ModalShell>
  );
}

function RenameSetModal({
  setId,
  currentTitle,
  onClose,
  onRenamed,
}: {
  setId: number;
  currentTitle: string;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [title, setTitle] = useState(currentTitle);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    await fetch(`/api/vocab/my-sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setBusy(false);
    onRenamed();
    onClose();
  }

  return (
    <ModalShell title="Đổi tên bộ từ" onClose={onClose}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm"
        autoFocus
      />
      <footer className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-surface-soft text-ink2 text-sm"
        >
          Hủy
        </button>
        <button
          onClick={submit}
          disabled={busy || !title.trim()}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Đang lưu..." : "Lưu"}
        </button>
      </footer>
    </ModalShell>
  );
}

function AddWordsModal({
  setId,
  allSets,
  onClose,
  onAdded,
}: {
  setId: number;
  allSets: MyVocabSetCard[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<"manual" | "ai" | "file" | "paste">("manual");
  const [targetSetId, setTargetSetId] = useState(setId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manualRows, setManualRows] = useState([
    { word: "", phonetic: "", meaning: "", partOfSpeech: "", example: "" },
  ]);
  const [pasteText, setPasteText] = useState("");
  const [aiMode, setAiMode] = useState<"text" | "reading" | "image">("text");
  const [aiInput, setAiInput] = useState("");
  const [aiCount, setAiCount] = useState(10);
  const [aiImageFile, setAiImageFile] = useState<File | null>(null);
  const [aiStatus, setAiStatus] = useState("");
  const [aiCandidates, setAiCandidates] = useState<AiVocabCandidate[]>([]);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());

  function addRow() {
    setManualRows((prev) => [
      ...prev,
      { word: "", phonetic: "", meaning: "", partOfSpeech: "", example: "" },
    ]);
  }

  function updateRow(index: number, field: string, value: string) {
    setManualRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function removeRow(index: number) {
    if (manualRows.length <= 1) return;
    setManualRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function submitManual() {
    const rows = manualRows
      .map(
        (r) =>
          [r.word, r.phonetic, r.partOfSpeech, r.meaning, r.example]
            .join(" | ")
            .trim(),
      )
      .filter((line) => line.split("|").some((p) => p.trim()));
    if (!rows.length) return;

    await submitRows(rows.join("\n"));
  }

  async function submitPaste() {
    if (!pasteText.trim()) return;
    await submitRows(pasteText);
  }

  async function submitRows(rowsText: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/vocab/my-sets/${targetSetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", rowsText }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Khong the them tu vung");
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Khong the them tu vung");
    } finally {
      setBusy(false);
    }
  }

  async function submitFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/vocab/my-sets/${targetSetId}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Khong the import file");
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Khong the import file");
    } finally {
      setBusy(false);
    }
  }

  async function previewAi() {
    setBusy(true);
    setError("");
    setAiStatus("AI dang phan tich...");
    setAiCandidates([]);

    let image: string | undefined;
    let imageMimeType: string | undefined;
    if (aiMode === "image" && aiImageFile) {
      image = await fileToBase64(aiImageFile);
      imageMimeType = aiImageFile.type;
    }

    try {
      const res = await fetch(`/api/vocab/sets/${targetSetId}/ai-words/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: aiMode,
          input: aiInput,
          count: aiCount,
          image,
          imageMimeType,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false || !Array.isArray(data?.data)) {
        throw new Error(data?.error || "AI chua tao duoc tu");
      }
      setAiCandidates(data.data);
      setAiSelected(new Set(data.data.map((_: AiVocabCandidate, index: number) => index)));
      setAiStatus(`Da tao ${data.data.length} tu, hay chon tu muon luu.`);
    } catch (err) {
      setAiStatus("");
      setError(err instanceof Error ? err.message : "AI chua tao duoc tu");
    } finally {
      setBusy(false);
    }
  }

  async function saveAi() {
    const selectedCandidates = aiCandidates.filter((_, index) => aiSelected.has(index));
    if (!selectedCandidates.length) return;

    setBusy(true);
    setError("");
    setAiStatus("Dang luu tu AI...");
    try {
      const res = await fetch(`/api/vocab/sets/${targetSetId}/ai-words/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: selectedCandidates }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || "Khong the luu tu AI");
      }
      onAdded();
      onClose();
    } catch (err) {
      setAiStatus("");
      setError(err instanceof Error ? err.message : "Khong the luu tu AI");
    } finally {
      setBusy(false);
    }
  }

  function toggleAiCandidate(index: number) {
    setAiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAllAiCandidates() {
    setAiSelected((prev) =>
      prev.size === aiCandidates.length
        ? new Set()
        : new Set(aiCandidates.map((_, index) => index)),
    );
  }

  return (
    <ModalShell title="Thêm từ vựng" onClose={onClose}>
      {/* Target set selector */}
      <label className="block text-sm font-semibold text-ink2 mb-1">
        Thêm vào bộ từ
      </label>
      <select
        value={targetSetId}
        onChange={(e) => setTargetSetId(Number(e.target.value))}
        className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm mb-3"
      >
        {allSets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.icon || "📖"} {s.title}
          </option>
        ))}
      </select>

      {/* Add word tabs */}
      <nav className="flex gap-1 mb-4">
        {(["manual", "ai", "file", "paste"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${t === "ai" ? "before:content-['AI'] " : ""}${
              tab === t
                ? "bg-accent text-white"
                : "bg-surface-soft text-ink2"
            }`}
          >
            {t === "manual" && "✍️ Nhập tay"}
            {t === "file" && "📄 File"}
            {t === "paste" && "📋 Paste"}
          </button>
        ))}
      </nav>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}

      {/* Manual tab */}
      {tab === "manual" && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {manualRows.map((row, i) => (
            <div key={i} className="flex gap-1 items-center">
              <span className="text-xs text-muted w-5 shrink-0">
                {i + 1}
              </span>
              <input
                value={row.word}
                onChange={(e) => updateRow(i, "word", e.target.value)}
                placeholder="Word"
                className="flex-1 px-2 py-1 rounded bg-surface-soft border border-line text-xs text-ink min-w-0"
              />
              <input
                value={row.meaning}
                onChange={(e) => updateRow(i, "meaning", e.target.value)}
                placeholder="Meaning"
                className="flex-1 px-2 py-1 rounded bg-surface-soft border border-line text-xs text-ink min-w-0"
              />
              <button
                onClick={() => removeRow(i)}
                className="text-red-400 text-xs shrink-0"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="text-xs text-accent font-semibold"
          >
            + Thêm hàng
          </button>
        </div>
      )}

      {/* AI tab */}
      {tab === "ai" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1">
            {(["text", "reading", "image"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setAiMode(m);
                  setAiCandidates([]);
                  setAiStatus("");
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  aiMode === m ? "bg-accent text-white" : "bg-surface-soft text-ink2"
                }`}
              >
                {m === "text" && "Chu de"}
                {m === "reading" && "Doan van"}
                {m === "image" && "Hinh anh"}
              </button>
            ))}
          </div>

          {aiMode === "image" ? (
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-line bg-surface-soft px-4 py-5 text-center hover:border-accent/40">
              <span className="block text-sm font-semibold text-ink">
                {aiImageFile ? aiImageFile.name : "Chon anh de AI lay tu vung"}
              </span>
              <span className="text-xs text-muted">JPG, PNG, WEBP toi da 5MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setAiImageFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          ) : (
            <textarea
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              rows={4}
              placeholder={
                aiMode === "reading"
                  ? "Paste doan van tieng Anh de AI trich tu nen hoc..."
                  : "Nhap chu de, vi du: airport announcements, office meeting..."
              }
              className="w-full rounded-lg border border-line bg-surface-soft px-3 py-2 text-sm text-ink"
            />
          )}

          <label className="flex items-center gap-2 text-sm text-ink2">
            So tu:
            <input
              type="number"
              min={1}
              max={50}
              value={aiCount}
              onChange={(e) => setAiCount(Number(e.target.value))}
              className="w-20 rounded border border-line bg-surface-soft px-2 py-1 text-sm text-ink"
            />
          </label>

          {aiStatus && (
            <p className={`text-xs font-semibold ${busy ? "animate-pulse text-muted" : "text-ink2"}`}>
              {aiStatus}
            </p>
          )}

          {aiCandidates.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-ink">
                  Da chon {aiSelected.size}/{aiCandidates.length}
                </strong>
                <button
                  type="button"
                  onClick={toggleAllAiCandidates}
                  className="text-xs font-semibold text-accent"
                >
                  {aiSelected.size === aiCandidates.length ? "Bo chon tat ca" : "Chon tat ca"}
                </button>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {aiCandidates.map((candidate, index) => (
                  <label
                    key={`${candidate.word}-${index}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                      aiSelected.has(index)
                        ? "border-accent/40 bg-accent/5"
                        : "border-line bg-surface-soft opacity-70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={aiSelected.has(index)}
                      onChange={() => toggleAiCandidate(index)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink">
                        {candidate.word}
                        {candidate.partOfSpeech ? (
                          <em className="ml-2 text-xs font-semibold not-italic text-muted">
                            {candidate.partOfSpeech}
                          </em>
                        ) : null}
                      </span>
                      <span className="block text-sm text-ink2">{candidate.meaning}</span>
                      {candidate.example ? (
                        <span className="mt-1 block text-xs italic text-muted">
                          {candidate.example}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* File tab */}
      {tab === "file" && (
        <div className="text-center py-6">
          <label className="cursor-pointer inline-block px-6 py-4 rounded-xl border-2 border-dashed border-line hover:border-accent/40 transition-colors">
            <p className="text-2xl mb-2">📁</p>
            <p className="text-sm text-muted">
              Chọn file CSV, Excel hoặc PDF
            </p>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf"
              onChange={submitFile}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Paste tab */}
      {tab === "paste" && (
        <div>
          <p className="text-xs text-muted mb-2">
            Mỗi dòng: <code>word | phonetic | partOfSpeech | meaning | example</code>
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"hello | /həˈloʊ/ | noun | Xin chào | Hello world."}
            className="w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink text-sm font-mono"
          />
        </div>
      )}

      {/* Submit */}
      {(tab === "manual" || tab === "paste") && (
        <footer className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-soft text-ink2 text-sm"
          >
            Hủy
          </button>
          <button
            onClick={tab === "manual" ? submitManual : submitPaste}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Đang lưu..." : "Thêm từ"}
          </button>
        </footer>
      )}

      {tab === "ai" && (
        <footer className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-soft text-ink2 text-sm"
          >
            Huy
          </button>
          {aiCandidates.length === 0 ? (
            <button
              onClick={previewAi}
              disabled={
                busy ||
                (aiMode !== "image" && !aiInput.trim()) ||
                (aiMode === "image" && !aiImageFile)
              }
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Dang tao..." : "Tao bang AI"}
            </button>
          ) : (
            <button
              onClick={saveAi}
              disabled={busy || aiSelected.size === 0}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Dang luu..." : `Luu ${aiSelected.size} tu`}
            </button>
          )}
        </footer>
      )}

      {busy && tab === "file" && (
        <p className="text-center text-sm text-muted animate-pulse">
          Đang import...
        </p>
      )}
    </ModalShell>
  );
}
