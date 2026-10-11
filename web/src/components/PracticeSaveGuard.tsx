"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { installStudyBackGuard } from "@/lib/study-back-guard";
import useDialogFocus from "./useDialogFocus";

type Queue = { pendingCount: number; flush: () => Promise<boolean>; error: string | null };
export default function PracticeSaveGuard({ queue, backHref }: { queue: Queue; backHref: string }) {
  const router = useRouter();
  const latest = useRef(queue);
  useEffect(() => { latest.current = queue; }, [queue]);
  const guard = useRef<ReturnType<typeof installStudyBackGuard> | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { if (!busyRef.current) { setTarget(null); setError(false); } }, []);
  useDialogFocus(Boolean(target), close, dialog);
  // Keep the guard mounted until navigation, even if a background save finishes
  // during the dialog. Its history entry must be removed through leave().
  useEffect(() => {
    const request = (href: string) => {
      if (!latest.current.pendingCount && !latest.current.error) {
        guard.current?.leave(() => router.replace(href));
      } else { setTarget(href); setError(false); }
    };
    guard.current = installStudyBackGuard(() => request(backHref));
    const link = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.href === location.href || url.hash) return;
      if (!latest.current.pendingCount && !latest.current.error) return;
      event.preventDefault(); event.stopPropagation();
      request(`${url.pathname}${url.search}`);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!latest.current.pendingCount && !latest.current.error) return;
      event.preventDefault(); event.returnValue = "";
    };
    document.addEventListener("click", link, true);
    window.addEventListener("beforeunload", unload);
    return () => { guard.current?.dispose(); document.removeEventListener("click", link, true); window.removeEventListener("beforeunload", unload); };
  }, [backHref, router]);
  const leave = () => { if (target) guard.current?.leave(() => router.replace(target)); };
  async function save() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(false);
    try { if (await latest.current.flush()) leave(); else setError(true); }
    catch { setError(true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  if (!target) return null;
  return <div className="fixed inset-0 z-[1200] grid place-items-center bg-black/50 p-4" onKeyDown={(event) => event.stopPropagation()}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="practice-leave-title" tabIndex={-1} className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6 text-ink">
      <h2 id="practice-leave-title" className="text-xl font-bold">Lưu tiến độ trước khi rời bài?</h2>
      <p>Đồng bộ các câu vừa học trước khi quay lại danh sách.</p>
      {error && <p role="alert">Chưa đồng bộ được. {queue.error || "Các mục chờ lưu vẫn được giữ trên thiết bị và tự gửi khi có mạng."}</p>}
      <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={close}>Học tiếp</button><button disabled={busy} onClick={leave}>Không chờ lưu</button><button data-dialog-initial-focus disabled={busy} onClick={() => void save()} className="rounded-xl bg-primary px-4 py-3 font-bold text-gold-ink">{busy ? "Đang lưu…" : "Lưu và quay lại"}</button></div>
    </section>
  </div>;
}
