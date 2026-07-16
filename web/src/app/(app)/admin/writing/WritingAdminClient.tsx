"use client";

import { useEffect, useMemo, useState } from "react";

type WritingPart = 1 | 2 | 3;
type WritingPromptStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
type Difficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

type WritingPrompt = {
  id: string;
  part: WritingPart;
  status: WritingPromptStatus;
  title: string;
  titleVi?: string | null;
  summary?: string | null;
  instructions?: string | null;
  promptText?: string | null;
  tags?: string[];
  difficulty?: Difficulty;
  timeLimitMinutes?: number | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  requiredTerms?: string[];
  taskChecklist?: string[];
  responseRules?: {
    minWords?: number | null;
    recommendedWords?: number | null;
    maxWords?: number | null;
    minSentences?: number | null;
    maxSentences?: number | null;
  } | null;
  hints?: { title: string; body: string; level?: number }[];
  sampleAnswers?: { answer: string; translationVi?: string | null; notes?: string | null }[];
  email?: {
    fromName?: string | null;
    toName?: string | null;
    subject?: string | null;
    body?: string | null;
    signature?: string | null;
  } | null;
  updatedAtMillis?: number | null;
};

type WritingOverview = {
  total: number;
  published: number;
  draft: number;
  review?: number;
  archived?: number;
  byPart: Partial<Record<WritingPart, number>>;
  lastUpdatedAtMillis: number | null;
};

type EditorDraft = {
  id: string | null;
  part: WritingPart;
  status: WritingPromptStatus;
  title: string;
  titleVi: string;
  summary: string;
  instructions: string;
  promptText: string;
  tags: string;
  difficulty: Difficulty;
  timeLimitMinutes: string;
  imageUrl: string;
  imageAlt: string;
  requiredTerms: string;
  taskChecklist: string;
  minWords: string;
  recommendedWords: string;
  maxWords: string;
  minSentences: string;
  maxSentences: string;
  hintTitle: string;
  hintBody: string;
  sampleAnswer: string;
  sampleTranslation: string;
  emailFromName: string;
  emailToName: string;
  emailSubject: string;
  emailBody: string;
  emailSignature: string;
};

const emptyOverview: WritingOverview = {
  total: 0,
  published: 0,
  draft: 0,
  review: 0,
  archived: 0,
  byPart: {},
  lastUpdatedAtMillis: null,
};

const emptyDraft = (): EditorDraft => ({
  id: null,
  part: 1,
  status: "DRAFT",
  title: "",
  titleVi: "",
  summary: "",
  instructions: "",
  promptText: "",
  tags: "",
  difficulty: "INTERMEDIATE",
  timeLimitMinutes: "",
  imageUrl: "",
  imageAlt: "",
  requiredTerms: "",
  taskChecklist: "",
  minWords: "",
  recommendedWords: "",
  maxWords: "",
  minSentences: "",
  maxSentences: "",
  hintTitle: "",
  hintBody: "",
  sampleAnswer: "",
  sampleTranslation: "",
  emailFromName: "",
  emailToName: "",
  emailSubject: "",
  emailBody: "",
  emailSignature: "",
});

const partLabels: Record<WritingPart, string> = {
  1: "Part 1 · Ảnh",
  2: "Part 2 · Email",
  3: "Part 3 · Essay",
};

const statusLabels: Record<WritingPromptStatus, string> = {
  DRAFT: "Bản nháp",
  REVIEW: "Chờ rà soát",
  PUBLISHED: "Đã xuất bản",
  ARCHIVED: "Đã lưu trữ",
};

export default function WritingAdminClient() {
  const [items, setItems] = useState<WritingPrompt[]>([]);
  const [overview, setOverview] = useState<WritingOverview>(emptyOverview);
  const [selected, setSelected] = useState<EditorDraft | null>(null);
  const [partFilter, setPartFilter] = useState<"ALL" | WritingPart>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | WritingPromptStatus>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/writing/prompts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Không thể tải dữ liệu Writing.");
      setItems(Array.isArray(body.data?.items) ? body.data.items : []);
      setOverview({ ...emptyOverview, ...(body.data?.overview ?? {}) });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Không thể tải dữ liệu Writing." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/writing/prompts", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => {
        if (cancelled) return;
        if (!response.ok || !body.success) throw new Error(body.error || "Không thể tải dữ liệu Writing.");
        setItems(Array.isArray(body.data?.items) ? body.data.items : []);
        setOverview({ ...emptyOverview, ...(body.data?.overview ?? {}) });
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice({ tone: "error", text: error instanceof Error ? error.message : "Không thể tải dữ liệu Writing." });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(
    () => items.filter((item) => (partFilter === "ALL" || item.part === partFilter) && (statusFilter === "ALL" || item.status === statusFilter)),
    [items, partFilter, statusFilter],
  );

  const selectPrompt = (prompt: WritingPrompt) => {
    const firstHint = prompt.hints?.[0];
    const firstSample = prompt.sampleAnswers?.[0];
    setSelected({
      id: prompt.id,
      part: prompt.part,
      status: prompt.status,
      title: prompt.title ?? "",
      titleVi: prompt.titleVi ?? "",
      summary: prompt.summary ?? "",
      instructions: prompt.instructions ?? "",
      promptText: prompt.promptText ?? "",
      tags: (prompt.tags ?? []).join(", "),
      difficulty: prompt.difficulty ?? "INTERMEDIATE",
      timeLimitMinutes: prompt.timeLimitMinutes == null ? "" : String(prompt.timeLimitMinutes),
      imageUrl: prompt.imageUrl ?? "",
      imageAlt: prompt.imageAlt ?? "",
      requiredTerms: (prompt.requiredTerms ?? []).join(", "),
      taskChecklist: (prompt.taskChecklist ?? []).join("\n"),
      minWords: numberText(prompt.responseRules?.minWords),
      recommendedWords: numberText(prompt.responseRules?.recommendedWords),
      maxWords: numberText(prompt.responseRules?.maxWords),
      minSentences: numberText(prompt.responseRules?.minSentences),
      maxSentences: numberText(prompt.responseRules?.maxSentences),
      hintTitle: firstHint?.title ?? "",
      hintBody: firstHint?.body ?? "",
      sampleAnswer: firstSample?.answer ?? "",
      sampleTranslation: firstSample?.translationVi ?? "",
      emailFromName: prompt.email?.fromName ?? "",
      emailToName: prompt.email?.toName ?? "",
      emailSubject: prompt.email?.subject ?? "",
      emailBody: prompt.email?.body ?? "",
      emailSignature: prompt.email?.signature ?? "",
    });
    setNotice(null);
  };

  const seed = async () => {
    setIsSeeding(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/writing/seed", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Không thể nạp bộ đề mẫu.");
      await load();
      const result = body.data as { created?: number; existing?: number; total?: number };
      setNotice({
        tone: "success",
        text: `Đã kiểm tra bộ đề gốc: thêm ${result.created ?? 0}, giữ nguyên ${result.existing ?? 0}, tổng ${result.total ?? 0}.`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Không thể nạp bộ đề mẫu." });
    } finally {
      setIsSeeding(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    if (!selected.title.trim()) {
      setNotice({ tone: "error", text: "Cần nhập tiêu đề đề Writing." });
      return;
    }

    setIsSaving(true);
    setNotice(null);
    const payload = toPayload(selected);
    try {
      const response = await fetch(selected.id ? `/api/admin/writing/prompts/${selected.id}` : "/api/admin/writing/prompts", {
        method: selected.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Không thể lưu đề Writing.");
      await load();
      selectPrompt(body.data as WritingPrompt);
      setNotice({ tone: "success", text: selected.id ? "Đã lưu thay đổi." : "Đã tạo bản nháp mới." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Không thể lưu đề Writing." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-sky-50 via-surface to-violet-50 p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Writing content studio</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Quản lý nội dung Writing có thể kiểm chứng</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Chỉ quản lý đề tự biên soạn hoặc tài sản có quyền sử dụng rõ ràng. Việc nạp bộ đề là idempotent, không ghi đè bản đã chỉnh sửa.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setSelected(emptyDraft()); setNotice(null); }} className="rounded-xl border border-primary bg-surface px-4 py-2.5 text-sm font-extrabold text-primary transition-transform active:scale-[0.98] disabled:opacity-50">+ Tạo bản nháp</button>
            <button type="button" onClick={seed} disabled={isSeeding} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">{isSeeding ? "Đang nạp…" : "Nạp bộ đề gốc"}</button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Tổng đề" value={overview.total} />
        <Metric label="Đã xuất bản" value={overview.published} accent="text-emerald-700" />
        <Metric label="Chờ rà soát" value={overview.review ?? 0} accent="text-amber-700" />
        <Metric label="Bản nháp" value={overview.draft} />
        <Metric label="Cập nhật gần nhất" value={formatDate(overview.lastUpdatedAtMillis)} compact />
      </section>

      {notice && <p role="status" className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-sky-200 bg-sky-50 text-sky-800"}`}>{notice.text}</p>}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="min-w-0 rounded-2xl border border-line bg-surface">
          <div className="border-b border-line p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-ink">Thư viện đề</h2>
                <p className="mt-1 text-sm text-muted">Số lượng hiển thị là dữ liệu nội dung hiện có, không phải số lượt làm bài.</p>
              </div>
              <button type="button" onClick={() => void load()} disabled={isLoading} className="self-start rounded-lg border border-line px-3 py-2 text-xs font-extrabold text-ink transition-transform active:scale-[0.98] disabled:opacity-50">{isLoading ? "Đang tải…" : "Làm mới"}</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Bộ lọc đề Writing">
              <FilterButton active={partFilter === "ALL"} onClick={() => setPartFilter("ALL")}>Tất cả ({overview.total})</FilterButton>
              {([1, 2, 3] as WritingPart[]).map((part) => <FilterButton key={part} active={partFilter === part} onClick={() => setPartFilter(part)}>{partLabels[part]} ({overview.byPart?.[part] ?? 0})</FilterButton>)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["ALL", "DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const).map((status) => <FilterButton key={status} active={statusFilter === status} onClick={() => setStatusFilter(status)} subdued>{status === "ALL" ? "Mọi trạng thái" : statusLabels[status]}</FilterButton>)}
            </div>
          </div>

          <div className="divide-y divide-line">
            {isLoading && <div className="p-8 text-sm text-muted">Đang tải thư viện đề…</div>}
            {!isLoading && filteredItems.map((item) => <PromptRow key={item.id} item={item} active={selected?.id === item.id} onClick={() => selectPrompt(item)} />)}
            {!isLoading && filteredItems.length === 0 && <div className="p-8 text-center"><p className="font-extrabold text-ink">Chưa có đề phù hợp</p><p className="mt-1 text-sm text-muted">Nạp bộ đề gốc hoặc tạo bản nháp mới để bắt đầu quy trình biên soạn.</p></div>}
          </div>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-5 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
          {selected ? <PromptEditor draft={selected} onChange={setSelected} onSave={() => void save()} onCancel={() => setSelected(null)} isSaving={isSaving} /> : <section className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center"><p className="text-lg font-extrabold text-ink">Chọn một đề để biên soạn</p><p className="mt-2 text-sm leading-6 text-muted">Bạn có thể chỉnh nội dung, gợi ý, câu mẫu, quy tắc chấm và trạng thái phát hành tại đây.</p><button type="button" onClick={() => setSelected(emptyDraft())} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-white transition-transform active:scale-[0.98]">Tạo bản nháp</button></section>}
        </aside>
      </section>
    </div>
  );
}

function Metric({ label, value, accent = "text-ink", compact = false }: { label: string; value: string | number; accent?: string; compact?: boolean }) {
  return <article className="rounded-2xl border border-line bg-surface p-4"><p className="text-xs font-bold text-muted">{label}</p><strong className={`mt-2 block font-extrabold ${compact ? "text-base" : "text-2xl"} ${accent}`}>{value}</strong></article>;
}

function FilterButton({ active, onClick, children, subdued = false }: { active: boolean; onClick: () => void; children: React.ReactNode; subdued?: boolean }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors ${active ? "border-primary bg-primary text-white" : subdued ? "border-line bg-surface text-muted hover:border-primary/40 hover:text-primary" : "border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"}`}>{children}</button>;
}

function PromptRow({ item, active, onClick }: { item: WritingPrompt; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`block w-full px-4 py-4 text-left transition-colors sm:px-5 ${active ? "bg-primary/5" : "hover:bg-surface-soft"}`}>
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-soft text-xs font-black text-primary">P{item.part}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-extrabold text-ink">{item.title}</span><StatusBadge status={item.status} /></span>
        {(item.titleVi || item.summary || item.promptText) && <span className="mt-1 line-clamp-2 block text-sm leading-5 text-muted">{item.titleVi || item.summary || item.promptText}</span>}
        <span className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-muted"><span>{partLabels[item.part]}</span><span>·</span><span>{item.difficulty ?? "INTERMEDIATE"}</span>{item.timeLimitMinutes ? <><span>·</span><span>{item.timeLimitMinutes} phút</span></> : null}</span>
      </span>
    </div>
  </button>;
}

function StatusBadge({ status }: { status: WritingPromptStatus }) {
  const styles: Record<WritingPromptStatus, string> = { DRAFT: "bg-slate-100 text-slate-600", REVIEW: "bg-amber-100 text-amber-800", PUBLISHED: "bg-emerald-100 text-emerald-800", ARCHIVED: "bg-stone-100 text-stone-600" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${styles[status]}`}>{statusLabels[status]}</span>;
}

function PromptEditor({ draft, onChange, onSave, onCancel, isSaving }: { draft: EditorDraft; onChange: (next: EditorDraft) => void; onSave: () => void; onCancel: () => void; isSaving: boolean }) {
  const set = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) => onChange({ ...draft, [key]: value });
  return <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">{draft.id ? "Chỉnh sửa đề" : "Bản nháp mới"}</p><h2 className="mt-1 text-lg font-extrabold text-ink">Nội dung & tiêu chí</h2></div><button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-sm font-bold text-muted hover:bg-surface-soft hover:text-ink">Đóng</button></div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <Select label="Phần" value={String(draft.part)} onChange={(value) => set("part", Number(value) as WritingPart)} values={[["1", partLabels[1]], ["2", partLabels[2]], ["3", partLabels[3]]]} />
      <Select label="Trạng thái" value={draft.status} onChange={(value) => set("status", value as WritingPromptStatus)} values={(Object.keys(statusLabels) as WritingPromptStatus[]).map((value) => [value, statusLabels[value]])} />
      <Select label="Độ khó" value={draft.difficulty} onChange={(value) => set("difficulty", value as Difficulty)} values={[["BEGINNER", "Cơ bản"], ["INTERMEDIATE", "Trung bình"], ["ADVANCED", "Nâng cao"]]} />
      <Field label="Thời gian (phút)" value={draft.timeLimitMinutes} onChange={(value) => set("timeLimitMinutes", value)} inputMode="numeric" />
    </div>

    <div className="mt-3 space-y-3">
      <Field label="Tiêu đề *" value={draft.title} onChange={(value) => set("title", value)} placeholder="Ví dụ: Confirming a delivery appointment" />
      <Field label="Tiêu đề tiếng Việt" value={draft.titleVi} onChange={(value) => set("titleVi", value)} placeholder="Ví dụ: Xác nhận lịch giao hàng" />
      <TextArea label="Tóm tắt cho thư viện" value={draft.summary} onChange={(value) => set("summary", value)} rows={2} />
      <TextArea label="Hướng dẫn làm bài" value={draft.instructions} onChange={(value) => set("instructions", value)} rows={3} placeholder="Nêu rõ yêu cầu, không sao chép đề TOEIC có bản quyền." />
      <TextArea label="Nội dung đề" value={draft.promptText} onChange={(value) => set("promptText", value)} rows={5} placeholder="Part 1: mô tả cảnh ảnh. Part 2: yêu cầu email. Part 3: câu hỏi opinion/argument." />
      <Field label="Tags (ngăn cách bằng dấu phẩy)" value={draft.tags} onChange={(value) => set("tags", value)} placeholder="workplace, delivery, polite request" />
    </div>

    <details className="mt-5 rounded-xl border border-line bg-surface-soft p-3" open>
      <summary className="cursor-pointer text-sm font-extrabold text-ink">Gợi ý, câu mẫu và quy tắc phản hồi</summary>
      <div className="mt-3 space-y-3">
        {draft.part === 1 && <><Field label="URL ảnh gốc" value={draft.imageUrl} onChange={(value) => set("imageUrl", value)} placeholder="/writing/... hoặc URL đã được cấp quyền" /><Field label="Mô tả ảnh (alt)" value={draft.imageAlt} onChange={(value) => set("imageAlt", value)} /></>}
        <Field label={draft.part === 1 ? "Từ/cụm từ bắt buộc (dấu phẩy)" : "Từ khóa gợi ý (dấu phẩy)"} value={draft.requiredTerms} onChange={(value) => set("requiredTerms", value)} placeholder="prepare, presentation" />
        <TextArea label="Checklist nhiệm vụ (mỗi dòng một ý)" value={draft.taskChecklist} onChange={(value) => set("taskChecklist", value)} rows={3} />
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Tiêu đề gợi ý" value={draft.hintTitle} onChange={(value) => set("hintTitle", value)} placeholder="Gợi ý 1" /><Field label="Nội dung gợi ý" value={draft.hintBody} onChange={(value) => set("hintBody", value)} placeholder="Nhắc người học về cấu trúc hoặc ý cần có." /></div>
        <TextArea label="Câu/bài mẫu" value={draft.sampleAnswer} onChange={(value) => set("sampleAnswer", value)} rows={4} />
        <TextArea label="Bản dịch câu mẫu" value={draft.sampleTranslation} onChange={(value) => set("sampleTranslation", value)} rows={2} />
        <RuleFields draft={draft} set={set} />
      </div>
    </details>

    {draft.part === 2 && <details className="mt-3 rounded-xl border border-line bg-surface-soft p-3" open><summary className="cursor-pointer text-sm font-extrabold text-ink">Bối cảnh email (không bắt buộc)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Người gửi" value={draft.emailFromName} onChange={(value) => set("emailFromName", value)} /><Field label="Người nhận" value={draft.emailToName} onChange={(value) => set("emailToName", value)} /><Field label="Chủ đề" value={draft.emailSubject} onChange={(value) => set("emailSubject", value)} /><Field label="Chữ ký" value={draft.emailSignature} onChange={(value) => set("emailSignature", value)} /></div><TextArea label="Nội dung email nguồn" value={draft.emailBody} onChange={(value) => set("emailBody", value)} rows={5} /></details>}

    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">Điểm AI và trạng thái xuất bản chỉ là công cụ hỗ trợ. Chỉ xuất bản sau khi người biên soạn kiểm tra nội dung, ảnh và quyền sử dụng.</p>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} disabled={isSaving} className="rounded-xl border border-line px-4 py-2.5 text-sm font-extrabold text-ink transition-transform active:scale-[0.98] disabled:opacity-50">Hủy</button><button type="button" onClick={onSave} disabled={isSaving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-white transition-transform active:scale-[0.98] disabled:opacity-50">{isSaving ? "Đang lưu…" : draft.id ? "Lưu thay đổi" : "Tạo bản nháp"}</button></div>
  </section>;
}

function RuleFields({ draft, set }: { draft: EditorDraft; set: <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) => void }) {
  const fields: Array<[keyof EditorDraft, string]> = [["minWords", "Tối thiểu từ"], ["recommendedWords", "Số từ khuyến nghị"], ["maxWords", "Tối đa từ"], ["minSentences", "Tối thiểu câu"], ["maxSentences", "Tối đa câu"]];
  return <div><p className="text-sm font-bold text-ink">Giới hạn phản hồi</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{fields.map(([key, label]) => <Field key={key} label={label} value={draft[key] as string} onChange={(value) => set(key, value as EditorDraft[typeof key])} inputMode="numeric" />)}</div></div>;
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  return <label className="block text-sm font-bold text-ink">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-normal text-ink outline-none transition-colors placeholder:text-muted focus:border-primary" /></label>;
}

function TextArea({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; rows: number }) {
  return <label className="block text-sm font-bold text-ink">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} className="mt-1 w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm font-normal leading-6 text-ink outline-none transition-colors placeholder:text-muted focus:border-primary" /></label>;
}

function Select({ label, value, onChange, values }: { label: string; value: string; onChange: (value: string) => void; values: Array<[string, string]> }) {
  return <label className="block text-sm font-bold text-ink">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-normal text-ink outline-none focus:border-primary">{values.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}</select></label>;
}

function toPayload(draft: EditorDraft) {
  const numberOrUndefined = (value: string) => value.trim() === "" ? undefined : Number(value);
  const splitComma = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const splitLines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
  const responseRules = compactObject({ minWords: numberOrUndefined(draft.minWords), recommendedWords: numberOrUndefined(draft.recommendedWords), maxWords: numberOrUndefined(draft.maxWords), minSentences: numberOrUndefined(draft.minSentences), maxSentences: numberOrUndefined(draft.maxSentences) });
  const hasEmailContext = [draft.emailFromName, draft.emailToName, draft.emailSubject, draft.emailBody, draft.emailSignature].some((value) => value.trim());
  return compactObject({
    part: draft.part,
    status: draft.status,
    title: draft.title.trim(),
    titleVi: optionalText(draft.titleVi),
    summary: optionalText(draft.summary),
    instructions: optionalText(draft.instructions),
    promptText: optionalText(draft.promptText),
    tags: splitComma(draft.tags),
    difficulty: draft.difficulty,
    timeLimitMinutes: numberOrUndefined(draft.timeLimitMinutes),
    imageUrl: optionalText(draft.imageUrl) ?? null,
    imageAlt: optionalText(draft.imageAlt) ?? null,
    requiredTerms: splitComma(draft.requiredTerms),
    taskChecklist: splitLines(draft.taskChecklist),
    responseRules: Object.keys(responseRules).length ? responseRules : undefined,
    hints: draft.hintBody.trim() ? [{ title: draft.hintTitle.trim() || "Gợi ý", body: draft.hintBody.trim(), level: 1 }] : [],
    sampleAnswers: draft.sampleAnswer.trim() ? [{ answer: draft.sampleAnswer.trim(), translationVi: optionalText(draft.sampleTranslation) }] : [],
    email: hasEmailContext ? compactObject({ fromName: optionalText(draft.emailFromName), toName: optionalText(draft.emailToName), subject: optionalText(draft.emailSubject), body: optionalText(draft.emailBody), signature: optionalText(draft.emailSignature) }) : null,
  });
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function optionalText(value: string) {
  const text = value.trim();
  return text || undefined;
}

function numberText(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function formatDate(value: number | null | undefined) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
