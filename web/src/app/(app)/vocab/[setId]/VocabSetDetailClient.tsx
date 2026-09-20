"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AiVocabCandidate, VocabWordCard } from "@/types/vocab";
import useDialogFocus from "@/components/useDialogFocus";

const DictionaryAddModal = dynamic(() => import("./DictionaryAddModal"), {
  ssr: false,
  loading: () => null,
});

type Filter = "all" | "mastered" | "learning";
type AddMode = "form" | "paste";
type Draft = { key: number; word: string; phonetic: string; meaning: string; partOfSpeech: string; example: string; note: string };
const blank = (key: number): Draft => ({ key, word: "", phonetic: "", meaning: "", partOfSpeech: "NOUN", example: "", note: "" });

export default function VocabSetDetailClient({ setId, words: initialWords, isOwner }: { setId: number; words: VocabWordCard[]; isOwner: boolean }) {
  const inputFile = useRef<HTMLInputElement>(null);
  const [words, setWords] = useState(initialWords);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [ai, setAi] = useState(false);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const filtered = useMemo(() => words.filter((word) => {
    const q = search.trim().toLowerCase();
    return (!q || word.word.toLowerCase().includes(q) || word.meaning.toLowerCase().includes(q)) && (filter === "all" || (filter === "mastered" ? word.mastered : !word.mastered));
  }), [words, search, filter]);
  const mastered = words.filter((word) => word.mastered).length;
  const progress = words.length ? Math.round(mastered / words.length * 100) : 0;

  function speak(word: VocabWordCard) { const url = word.audioUsUrl || word.audioUrl || word.audioUkUrl; if (url) new Audio(url).play().catch(() => window.speechSynthesis.speak(new SpeechSynthesisUtterance(word.word))); else window.speechSynthesis.speak(new SpeechSynthesisUtterance(word.word)); }
  async function markKnown(id: number) { const res = await fetch(`/api/vocab/words/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mastered: true }) }); if (res.status === 401) { window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`; return; } const json = await res.json(); if (json.success && json.data?.newStatus === "MASTERED") setWords((old) => old.map((word) => word.id === id ? { ...word, mastered: true } : word)); else setNotice(json.error || "Không thể cập nhật từ vựng."); }
  async function refreshWords() { const res = await fetch(`/api/vocab/sets/${setId}`, { cache: "no-store" }); const json = await res.json(); if (json.success && Array.isArray(json.data?.words)) setWords(json.data.words); }
  async function importFile(file: File) { setUploading(true); const data = new FormData(); data.append("file", file); try { const res = await fetch(`/api/vocab/my-sets/${setId}`, { method: "POST", body: data }); const json = await res.json(); if (!json.success) throw new Error(json.error); await refreshWords(); setNotice(`Đã thêm ${json.data.count} từ từ ${file.name}.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể nhập tệp."); } finally { setUploading(false); if (inputFile.current) inputFile.current.value = ""; } }

  return <section className="space-y-6">
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><Stat icon="▤" label="Tổng" value={words.length} tone="azure" /><Stat icon="✓" label="Thuộc" value={mastered} tone="jade" /><Stat icon="◷" label="Chưa" value={words.length - mastered} tone="gold" /><Stat icon="%" label="Tiến trình" value={`${progress}%`} tone="plum" /></div>
    <div className="rounded-[28px] border-2 border-line bg-surface p-3"><div className="flex flex-wrap items-center gap-3"><label className="relative min-w-[200px] flex-1"><span className="pointer-events-none absolute left-4 top-2.5 text-muted">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm từ..." className="w-full rounded-full border border-line bg-surface-soft py-2.5 pl-10 pr-4 text-sm text-ink outline-none focus:border-accent" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="rounded-full border border-line bg-surface-soft px-4 py-2.5 text-sm text-ink outline-none"><option value="all">Tất cả</option><option value="mastered">Đã thuộc</option><option value="learning">Chưa thuộc</option></select>{isOwner && <div className="ml-auto flex flex-wrap gap-2"><button onClick={() => setAi(true)} className="rounded-full bg-plum px-4 py-2.5 text-sm font-bold text-white">ϟ Thêm từ với AI</button><button onClick={() => setAdding(true)} className="rounded-full bg-jade px-4 py-2.5 text-sm font-bold text-white">▱ Thêm nhiều từ</button></div>}</div></div>
    {notice && <p className="rounded-xl border border-line bg-surface-soft px-4 py-3 text-sm text-ink2">{notice}</p>}
    <div className="overflow-x-auto rounded-[28px] border-2 border-line bg-surface"><table className="w-full min-w-[800px] text-left"><thead className="bg-surface-soft text-xs font-bold uppercase tracking-wide text-muted"><tr><th className="w-12 px-5 py-4"><span className="block h-5 w-5 rounded-full border-2 border-line" /></th><th className="px-3 py-4">Từ vựng</th><th className="px-3 py-4">Nghĩa</th><th className="px-3 py-4">Loại từ</th><th className="px-3 py-4">Ví dụ</th><th className="w-24 px-5 py-4 text-right">Thuộc</th></tr></thead><tbody>{filtered.map((word) => <tr key={word.id} className="border-t border-line/70 hover:bg-surface-soft/40"><td className="px-5 py-4"><span className="block h-4 w-4 rounded-full border-2 border-line" /></td><td className="px-3 py-4"><div className="flex items-start gap-2"><button onClick={() => speak(word)} className="text-azure" aria-label={`Nghe ${word.word}`}>♬</button><div><b className="text-ink">{word.word}</b><p className="font-mono text-xs text-muted">{word.phoneticUs || word.phoneticUk || word.phonetic || "—"}</p></div></div></td><td className="max-w-[220px] px-3 py-4 font-semibold text-ink2">{word.meaning}</td><td className="px-3 py-4"><Badge value={word.partOfSpeech} /></td><td className="max-w-[320px] px-3 py-4 text-sm text-ink2"><p className="line-clamp-2">{word.example || "—"}</p></td><td className="px-5 py-4 text-right"><button onClick={() => !word.mastered && markKnown(word.id)} disabled={word.mastered} title={word.mastered ? "Đã thuộc" : "Đánh dấu đã thuộc"} className={`inline-flex h-6 w-11 rounded-full p-1 ${word.mastered ? "bg-jade" : "bg-slate-300 dark:bg-slate-600"}`}><span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${word.mastered ? "translate-x-5" : ""}`} /></button></td></tr>)}</tbody></table>{!filtered.length && <p className="py-12 text-center text-sm text-muted">{words.length ? "Không tìm thấy từ phù hợp." : "Bộ từ này chưa có từ vựng nào."}</p>}</div>
    <input ref={inputFile} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) importFile(file); }} />
    {adding && <DictionaryAddModal setId={setId} uploading={uploading} onImport={() => inputFile.current?.click()} onClose={() => setAdding(false)} onSaved={(count) => { setAdding(false); setNotice(`Đã thêm ${count} từ vựng.`); void refreshWords(); }} />}
    {ai && <AiModal setId={setId} onClose={() => setAi(false)} onSaved={(count) => { setAi(false); setNotice(`AI đã thêm ${count} từ vựng.`); void refreshWords(); }} />}
  </section>;
}

function Stat({ icon, label, value, tone }: { icon: string; label: string; value: string | number; tone: "azure" | "jade" | "gold" | "plum" }) { const colors = { azure: "bg-azure text-white", jade: "bg-jade text-white", gold: "bg-gold text-gold-ink", plum: "bg-plum text-white" }; return <article className="flex min-h-28 items-center gap-4 rounded-[26px] border-2 border-line bg-surface px-5 py-4"><span className={`grid h-14 w-14 place-items-center rounded-full text-2xl font-bold shadow-lg ${colors[tone]}`}>{icon}</span><div><p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p><p className="text-3xl font-extrabold text-ink">{value}</p></div></article>; }
function Badge({ value }: { value?: string }) { const label = value?.toUpperCase() || "OTHER"; const color = label === "VERB" || label === "V" ? "bg-crimson/15 text-crimson2" : label === "ADJ" ? "bg-plum/15 text-plum2" : "bg-azure/15 text-azure2"; return <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${color}`}>{label}</span>; }

// Kept during the transition so existing manual-add behavior remains available for comparison.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AddModal({ setId, uploading, onImport, onClose, onSaved }: { setId: number; uploading: boolean; onImport: () => void; onClose: () => void; onSaved: (count: number) => void }) {
  const [mode, setMode] = useState<AddMode>("form"); const [rows, setRows] = useState<Draft[]>([blank(1)]); const [paste, setPaste] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const update = (key: number, field: keyof Draft, value: string) => setRows((old) => old.map((row) => row.key === key ? { ...row, [field]: value } : row));
  function previewPaste() { const next = paste.split(/\r?\n/).map((line, index) => { const part = line.split("|").map((cell) => cell.trim()); return { key: Date.now() + index, word: part[0] || "", phonetic: part[1] || "", partOfSpeech: part[2] || "NOUN", meaning: part[3] || "", example: part[4] || "", note: part[5] || "" }; }).filter((row) => row.word || row.meaning); if (!next.length) { setError("Hãy nhập ít nhất một dòng."); return; } setRows(next); setMode("form"); setError(""); }
  async function save() { const valid = rows.filter((row) => row.word.trim() && row.meaning.trim()); if (!valid.length) { setError("Mỗi từ cần có Từ vựng và Nghĩa."); return; } setSaving(true); setError(""); try { const rowsText = valid.map((row) => [row.word, row.phonetic, row.partOfSpeech, row.meaning, row.example].join(" | ")).join("\n"); const res = await fetch(`/api/vocab/my-sets/${setId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "manual", rowsText }) }); const json = await res.json(); if (!json.success) throw new Error(json.error); onSaved(json.data.count); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu từ vựng."); } finally { setSaving(false); } }
  return <Dialog title="Thêm nhiều từ vựng" onClose={onClose}><div className="flex flex-wrap gap-2 border-b border-line pb-4"><button onClick={() => setMode("form")} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === "form" ? "bg-jade text-white" : "bg-surface-soft text-ink2"}`}>✎ Thêm thủ công</button><button onClick={() => setMode("paste")} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === "paste" ? "bg-jade text-white" : "bg-surface-soft text-ink2"}`}>ϟ Thêm nhanh</button><button onClick={onImport} disabled={uploading} className="rounded-full border border-line px-4 py-2 text-sm font-bold text-ink2 disabled:opacity-50">⇧ {uploading ? "Đang nhập..." : "Nhập file"}</button><span className="self-center text-xs text-muted">CSV, Excel, TXT hoặc PDF</span></div>{mode === "paste" ? <div className="pt-4"><p className="rounded-xl bg-plum/10 px-4 py-3 text-sm text-plum2"><b>Định dạng:</b> mỗi dòng một từ, cột cách nhau bằng <b>|</b><br /><small>từ vựng | phiên âm | loại từ | nghĩa | ví dụ | ghi chú</small></p><textarea value={paste} onChange={(event) => setPaste(event.target.value)} rows={9} placeholder={"abandon | /əˈbæn.dən/ | verb | từ bỏ | She abandoned her car.\nability | /əˈbɪl.ə.ti/ | noun | khả năng | He has great ability."} className="mt-4 w-full rounded-xl border border-line bg-surface-soft p-4 font-mono text-sm text-ink outline-none" /><button onClick={previewPaste} className="mt-3 rounded-full bg-jade px-5 py-2.5 text-sm font-bold text-white">Xem trước và chỉnh sửa</button></div> : <DraftTable rows={rows} update={update} add={() => setRows((old) => [...old, blank(Date.now())])} remove={(key) => setRows((old) => old.length === 1 ? [blank(Date.now())] : old.filter((row) => row.key !== key))} />}{error && <p className="mt-3 text-sm text-crimson2">{error}</p>}<footer className="mt-6 flex justify-end gap-3 border-t border-line pt-4"><button onClick={onClose} className="px-4 py-2 text-sm font-bold text-ink2">Hủy</button><button onClick={save} disabled={saving || mode !== "form"} className="rounded-full bg-jade px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang lưu..." : `Lưu ${rows.filter((row) => row.word && row.meaning).length} từ`}</button></footer></Dialog>;
}

function DraftTable({ rows, update, add, remove }: { rows: Draft[]; update: (key: number, field: keyof Draft, value: string) => void; add: () => void; remove: (key: number) => void }) {
  const field = (row: Draft, name: "word" | "phonetic" | "meaning" | "example" | "note", placeholder: string) => <input value={row[name]} onChange={(event) => update(row.key, name, event.target.value)} placeholder={placeholder} className="w-full min-w-24 rounded-lg border border-line bg-surface-soft px-2 py-2 text-ink outline-none" />;
  return <div className="overflow-x-auto pt-4"><table className="w-full min-w-[900px] text-sm"><thead className="bg-surface-soft text-xs font-bold uppercase text-muted"><tr><th>#</th><th>Từ vựng *</th><th>Phiên âm</th><th>Nghĩa *</th><th>Loại từ</th><th>Ví dụ</th><th>Ghi chú</th><th /></tr></thead><tbody>{rows.map((row, index) => <tr key={row.key} className="border-b border-line"><td className="px-2 py-3 text-muted">{index + 1}</td><td className="px-1 py-3">{field(row, "word", "hello")}</td><td className="px-1 py-3">{field(row, "phonetic", "/həˈləʊ/")}</td><td className="px-1 py-3">{field(row, "meaning", "Xin chào")}</td><td className="px-1 py-3"><select value={row.partOfSpeech} onChange={(event) => update(row.key, "partOfSpeech", event.target.value)} className="rounded-lg border border-line bg-surface-soft px-2 py-2 text-ink"><option>NOUN</option><option>VERB</option><option>ADJ</option><option>ADV</option><option>OTHER</option></select></td><td className="px-1 py-3">{field(row, "example", "Hello world")}</td><td className="px-1 py-3">{field(row, "note", "Ghi chú")}</td><td><button onClick={() => remove(row.key)} className="text-crimson2">⌫</button></td></tr>)}</tbody></table><button onClick={add} className="mt-4 w-full rounded-xl border border-dashed border-line py-3 text-sm font-bold text-ink2">＋ Thêm dòng</button></div>;
}

function AiModal({ setId, onClose, onSaved }: { setId: number; onClose: () => void; onSaved: (count: number) => void }) {
  const [mode, setMode] = useState<"topic" | "words" | "image">("topic");
  const [input, setInput] = useState("");
  const [count, setCount] = useState(10);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [items, setItems] = useState<AiVocabCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const canCreate = mode === "image" ? Boolean(imageFile) : Boolean(input.trim());

  async function preview() {
    setLoading(true); setStage(0); setError("");
    const timers = [700, 1500, 2500].map((delay, index) => window.setTimeout(() => setStage(index + 1), delay));
    try {
      const image = imageFile ? await fileToBase64(imageFile) : undefined;
      const body = { mode: mode === "topic" ? "text" : mode, input, count, image, imageMimeType: imageFile?.type };
      const res = await fetch(`/api/vocab/sets/${setId}/ai-words/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "AI chưa thể tạo từ vựng.");
      setItems(json.data);
      setSelected(new Set(json.data.map((_: AiVocabCandidate, index: number) => index)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Có lỗi xảy ra."); } finally { timers.forEach(window.clearTimeout); setLoading(false); }
  }
  async function save() {
    const candidates = items.filter((_, index) => selected.has(index));
    if (!candidates.length) return;
    setLoading(true); setStage(3); setError("");
    try { const res = await fetch(`/api/vocab/sets/${setId}/ai-words/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidates }) }); const json = await res.json(); if (!json.success) throw new Error(json.error); onSaved(json.data.saved); } catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể lưu từ vựng."); } finally { setLoading(false); }
  }
  function changeMode(next: typeof mode) { setMode(next); setItems([]); setError(""); }
  return <Dialog title="Tạo từ vựng với AI" onClose={onClose}>
    <div className="mt-4 flex flex-wrap gap-2 border-b border-line pb-4">
      <button onClick={() => changeMode("topic")} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === "topic" ? "bg-jade text-white" : "bg-surface-soft text-ink2"}`}>T Nhập chủ đề</button>
      <button onClick={() => changeMode("words")} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === "words" ? "bg-jade text-white" : "bg-surface-soft text-ink2"}`}>☷ Nhập từ tiếng Anh</button>
      <button onClick={() => changeMode("image")} className={`rounded-full px-4 py-2 text-sm font-bold ${mode === "image" ? "bg-jade text-white" : "bg-surface-soft text-ink2"}`}>▧ Hình ảnh <small className="ml-1 rounded bg-gold/20 px-1.5 py-0.5 text-gold2">BETA</small></button>
    </div>
    {!items.length && <div className="pt-4">
      {mode !== "image" ? <><textarea value={input} onChange={(event) => setInput(event.target.value)} rows={5} placeholder={mode === "topic" ? "Ví dụ: giao tiếp nơi công sở, du lịch, môi trường..." : "Dán một hoặc nhiều từ tiếng Anh: abandon, ability, broadcast..."} className="w-full rounded-2xl border border-line bg-surface-soft p-4 text-sm text-ink outline-none focus:border-jade" /><p className="mt-2 text-xs text-muted">{mode === "topic" ? "AI sẽ chọn các từ liên quan đến chủ đề và tra nghĩa, ví dụ." : "AI sẽ tự điền nghĩa, phiên âm, loại từ và ví dụ cho các từ bạn nhập."}</p></> : <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-line bg-surface-soft p-8 text-center hover:border-jade"><span className="text-3xl">▧</span><p className="mt-2 font-bold text-ink">{imageFile ? imageFile.name : "Tải ảnh lên để AI quét đồ vật và từ vựng"}</p><p className="mt-1 text-xs text-muted">JPG, PNG hoặc WEBP · tối đa 5MB</p><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size > 5 * 1024 * 1024) { setError("Ảnh cần nhỏ hơn 5MB."); return; } setImageFile(file); setError(""); }} /></label>}
      <label className="mt-4 block text-sm text-ink2">Số lượng từ <input type="number" min={1} max={50} value={count} onChange={(event) => setCount(Number(event.target.value))} className="ml-2 w-16 rounded border border-line bg-surface-soft px-2 py-1 text-ink" /></label>
    </div>}
    {loading && <ThinkingStage stage={stage} mode={mode} />}
    {items.length > 0 && <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{items.map((item, index) => <label key={`${item.word}-${index}`} className="flex gap-3 rounded-xl border border-line p-3"><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected((old) => { const next = new Set(old); if (next.has(index)) next.delete(index); else next.add(index); return next; })} /><span><b className="text-ink">{item.word}</b> <span className="text-xs text-muted">{item.phonetic}</span><span className="ml-2 text-sm text-ink2">{item.meaning}</span>{item.example && <small className="block text-muted">{item.example}</small>}</span></label>)}</div>}
    {error && <p className="mt-3 text-sm text-crimson2">{error}</p>}
    <footer className="mt-6 flex justify-end gap-3 border-t border-line pt-4"><button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-bold text-ink2">Hủy</button><button onClick={items.length ? save : preview} disabled={loading || (!items.length && !canCreate) || (items.length > 0 && !selected.size)} className="rounded-full bg-plum px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{loading ? "AI đang xử lý..." : items.length ? `Lưu ${selected.size} từ` : "Tạo từ vựng"}</button></footer>
  </Dialog>;
}

function ThinkingStage({ stage, mode }: { stage: number; mode: "topic" | "words" | "image" }) {
  const first = mode === "image" ? "AI đang quét và nhận diện hình ảnh..." : mode === "words" ? "AI đang đọc danh sách từ của bạn..." : "AI đang phân tích yêu cầu của bạn...";
  const steps = [first, "AI đang chọn những từ phù hợp...", "AI đang tra cứu từ điển và ví dụ...", "AI đang hoàn thiện danh sách từ vựng..."];
  return <div className="mt-5 rounded-2xl bg-jade/10 px-5 py-5 text-center"><div className="mb-3 flex justify-center gap-2">{steps.map((_, index) => <span key={index} className={`h-3 w-3 rounded-full ${index <= stage ? "animate-pulse bg-jade" : "bg-jade/25"}`} />)}</div><p className="font-bold text-jade2">✦ {steps[stage]}</p><p className="mt-1 text-xs text-muted">Vui lòng chờ một chút, AI đang chuẩn bị kết quả tốt nhất.</p></div>;
}

async function fileToBase64(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = () => reject(new Error("Không thể đọc ảnh.")); reader.readAsDataURL(file); }); }
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `dialog-${title.replace(/\s+/g, "-").toLowerCase()}`;
  useDialogFocus(true, onClose, dialogRef);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label={`Đóng ${title}`} onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-[28px] border border-line bg-surface p-5 shadow-2xl sm:p-7">
        <header className="flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-extrabold text-ink">{title}</h2>
          <button type="button" data-dialog-initial-focus onClick={onClose} className="text-2xl text-ink2" aria-label="Đóng">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}
