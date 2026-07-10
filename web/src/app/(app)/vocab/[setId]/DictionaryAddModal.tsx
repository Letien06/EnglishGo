"use client";

import { type ReactNode, useState } from "react";

type AddMode = "form" | "paste";
type Draft = {
  key: number;
  word: string;
  phonetic: string;
  meaning: string;
  partOfSpeech: string;
  example: string;
  note: string;
};

type DictionaryEntry = {
  word: string;
  phonetic: string;
  meaning: string;
  partOfSpeech: string;
  example: string;
  source: string;
};

type LookupState =
  | { status: "loading" }
  | { status: "ready"; entry: DictionaryEntry }
  | { status: "error"; message: string };

const blank = (key: number): Draft => ({
  key,
  word: "",
  phonetic: "",
  meaning: "",
  partOfSpeech: "NOUN",
  example: "",
  note: "",
});

export default function DictionaryAddModal({
  setId,
  uploading,
  onImport,
  onClose,
  onSaved,
}: {
  setId: number;
  uploading: boolean;
  onImport: () => void;
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [mode, setMode] = useState<AddMode>("form");
  const [rows, setRows] = useState<Draft[]>([blank(Date.now())]);
  const [paste, setPaste] = useState("");
  const [lookups, setLookups] = useState<Record<number, LookupState>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key: number, field: keyof Draft, value: string) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, [field]: value } : row));
  };

  const add = () => setRows((current) => [...current, blank(Date.now())]);
  const remove = (key: number) => {
    setRows((current) => current.length === 1 ? [blank(Date.now())] : current.filter((row) => row.key !== key));
    setLookups((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  };

  async function lookupWord(key: number, typedWord: string) {
    const word = typedWord.trim();
    if (word.length < 2) return;

    setLookups((current) => ({ ...current, [key]: { status: "loading" } }));
    try {
      const response = await fetch(`/api/vocab/dictionary?word=${encodeURIComponent(word)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Không tìm thấy từ này trong từ điển.");
      }
      setLookups((current) => ({ ...current, [key]: { status: "ready", entry: payload.data as DictionaryEntry } }));
    } catch (reason) {
      setLookups((current) => ({
        ...current,
        [key]: { status: "error", message: reason instanceof Error ? reason.message : "Không thể tra từ điển." },
      }));
    }
  }

  function applyDictionaryEntry(key: number, entry: DictionaryEntry) {
    setRows((current) => current.map((row) => row.key === key ? {
      ...row,
      word: entry.word,
      phonetic: entry.phonetic || row.phonetic,
      meaning: entry.meaning || row.meaning,
      partOfSpeech: normalizePartOfSpeech(entry.partOfSpeech),
      example: entry.example || row.example,
    } : row));
    setLookups((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  }

  function previewPaste() {
    const next = paste
      .split(/\r?\n/)
      .map((line, index) => {
        const cells = line.split("|").map((cell) => cell.trim());
        return {
          key: Date.now() + index,
          word: cells[0] || "",
          phonetic: cells[1] || "",
          partOfSpeech: cells[2] || "NOUN",
          meaning: cells[3] || "",
          example: cells[4] || "",
          note: cells[5] || "",
        };
      })
      .filter((row) => row.word || row.meaning);
    if (!next.length) {
      setError("Hãy nhập ít nhất một dòng.");
      return;
    }
    setRows(next);
    setMode("form");
    setError("");
  }

  async function save() {
    const valid = rows.filter((row) => row.word.trim() && row.meaning.trim());
    if (!valid.length) {
      setError("Mỗi từ cần có Từ vựng và Nghĩa.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const rowsText = valid
        .map((row) => [row.word, row.phonetic, row.partOfSpeech, row.meaning, row.example].join(" | "))
        .join("\n");
      const response = await fetch(`/api/vocab/my-sets/${setId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", rowsText }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Không thể lưu từ vựng.");
      onSaved(payload.data.count);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu từ vựng.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="add-vocab-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={onClose} />
      <section className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:rounded-[28px]">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-jade">Từ vựng cá nhân</p>
            <h2 id="add-vocab-title" className="mt-1 text-xl font-extrabold text-ink">Thêm từ vựng</h2>
            <p className="mt-1 text-sm text-muted">Tra từ trước khi điền để dùng dữ liệu đã kiểm chứng.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-xl text-ink2 hover:bg-surface-soft" aria-label="Đóng">×</button>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3 sm:px-7">
          <TabButton active={mode === "form"} onClick={() => setMode("form")}>✎ Nhập từng từ</TabButton>
          <TabButton active={mode === "paste"} onClick={() => setMode("paste")}>ϟ Dán nhanh</TabButton>
          <button type="button" onClick={onImport} disabled={uploading} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-ink2 disabled:opacity-50">⇧ {uploading ? "Đang nhập..." : "Nhập file"}</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {mode === "paste" ? (
            <div>
              <p className="rounded-2xl bg-plum/10 px-4 py-3 text-sm text-plum2"><b>Định dạng:</b> một từ trên mỗi dòng, các cột ngăn bởi <b>|</b><br /><small>từ vựng | phiên âm | loại từ | nghĩa | ví dụ | ghi chú</small></p>
              <textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={9} placeholder={"abandon | /əˈbæn.dən/ | VERB | từ bỏ | She abandoned her car.\nability | /əˈbɪl.ə.ti/ | NOUN | khả năng | He has great ability."} className="mt-4 w-full rounded-2xl border border-line bg-surface-soft p-4 font-mono text-sm text-ink outline-none focus:border-jade" />
              <button type="button" onClick={previewPaste} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-jade px-5 text-sm font-extrabold text-white">Xem trước và chỉnh sửa</button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Nhập từ tiếng Anh, rồi bấm <b>Tra từ</b>. Chọn <b>Điền các ô</b> để lấy phiên âm, nghĩa, loại từ và ví dụ từ kết quả từ điển.</p>
              {rows.map((row, index) => (
                <DraftCard
                  key={row.key}
                  row={row}
                  index={index}
                  lookup={lookups[row.key]}
                  onUpdate={update}
                  onLookup={() => void lookupWord(row.key, row.word)}
                  onApply={(entry) => applyDictionaryEntry(row.key, entry)}
                  onRemove={() => remove(row.key)}
                />
              ))}
              <button type="button" onClick={add} className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-dashed border-line text-sm font-extrabold text-ink2 hover:border-jade hover:text-jade">＋ Thêm dòng</button>
            </div>
          )}
          {error && <p className="mt-4 rounded-xl bg-crimson/10 px-4 py-3 text-sm font-semibold text-crimson2">{error}</p>}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-line bg-surface px-5 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="min-h-11 px-4 text-sm font-extrabold text-ink2">Hủy</button>
          <button type="button" onClick={save} disabled={saving || mode !== "form"} className="min-h-11 rounded-xl bg-jade px-5 text-sm font-extrabold text-white disabled:opacity-50">{saving ? "Đang lưu..." : `Lưu ${rows.filter((row) => row.word && row.meaning).length} từ`}</button>
        </footer>
      </section>
    </div>
  );
}

function DraftCard({
  row,
  index,
  lookup,
  onUpdate,
  onLookup,
  onApply,
  onRemove,
}: {
  row: Draft;
  index: number;
  lookup?: LookupState;
  onUpdate: (key: number, field: keyof Draft, value: string) => void;
  onLookup: () => void;
  onApply: (entry: DictionaryEntry) => void;
  onRemove: () => void;
}) {
  return (
    <article className="rounded-2xl border border-line bg-surface-soft p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-extrabold text-ink">Từ #{index + 1}</span>
        <button type="button" onClick={onRemove} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-crimson2 hover:bg-crimson/10" aria-label={`Xóa từ ${index + 1}`}>⌫</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <Field label="Từ tiếng Anh *" className="lg:col-span-3">
          <div className="flex gap-2">
            <input value={row.word} onChange={(event) => onUpdate(row.key, "word", event.target.value)} placeholder="hello" className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-ink outline-none focus:border-jade" />
            <button type="button" onClick={onLookup} disabled={lookup?.status === "loading" || row.word.trim().length < 2} className="shrink-0 rounded-xl border border-jade/30 bg-jade/10 px-3 text-sm font-extrabold text-jade disabled:opacity-50">{lookup?.status === "loading" ? "..." : "Tra từ"}</button>
          </div>
        </Field>
        <Field label="Phiên âm" className="lg:col-span-2"><input value={row.phonetic} onChange={(event) => onUpdate(row.key, "phonetic", event.target.value)} placeholder="/həˈləʊ/" className="input-draft" /></Field>
        <Field label="Nghĩa *" className="lg:col-span-3"><input value={row.meaning} onChange={(event) => onUpdate(row.key, "meaning", event.target.value)} placeholder="Xin chào" className="input-draft" /></Field>
        <Field label="Loại từ" className="lg:col-span-2"><select value={row.partOfSpeech} onChange={(event) => onUpdate(row.key, "partOfSpeech", event.target.value)} className="input-draft"><option>NOUN</option><option>VERB</option><option>ADJ</option><option>ADV</option><option>OTHER</option></select></Field>
        <Field label="Ví dụ" className="sm:col-span-2 lg:col-span-2"><input value={row.example} onChange={(event) => onUpdate(row.key, "example", event.target.value)} placeholder="Hello world" className="input-draft" /></Field>
        <Field label="Ghi chú" className="sm:col-span-2 lg:col-span-12"><input value={row.note} onChange={(event) => onUpdate(row.key, "note", event.target.value)} placeholder="Ghi chú riêng" className="input-draft" /></Field>
      </div>
      {lookup?.status === "ready" && (
        <div className="mt-3 rounded-xl border border-jade/25 bg-jade/10 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-ink">{lookup.entry.word} <span className="ml-1 font-mono text-xs font-medium text-muted">{lookup.entry.phonetic}</span></p>
              <p className="mt-1 text-sm text-ink2">{lookup.entry.meaning}</p>
              {lookup.entry.example && <p className="mt-1 text-xs text-muted">{lookup.entry.example}</p>}
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-jade">Nguồn: {lookup.entry.source}</p>
            </div>
            <button type="button" onClick={() => onApply(lookup.entry)} className="min-h-10 shrink-0 rounded-xl bg-jade px-4 text-sm font-extrabold text-white">Điền các ô</button>
          </div>
        </div>
      )}
      {lookup?.status === "error" && <p className="mt-2 text-xs font-semibold text-crimson2">{lookup.message}</p>}
    </article>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`block ${className ?? ""}`}><span className="mb-1.5 block text-xs font-extrabold text-muted">{label}</span>{children}</label>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-bold ${active ? "bg-jade text-white" : "bg-surface-soft text-ink2"}`}>{children}</button>;
}

function normalizePartOfSpeech(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized.startsWith("NOUN")) return "NOUN";
  if (normalized.startsWith("VERB")) return "VERB";
  if (normalized.startsWith("ADJ")) return "ADJ";
  if (normalized.startsWith("ADV")) return "ADV";
  return "OTHER";
}
