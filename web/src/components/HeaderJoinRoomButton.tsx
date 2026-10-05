"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

export default function HeaderJoinRoomButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setCode("");
      setError("");
      setLoading(false);
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError("Vui lòng nhập mã phòng");
      return;
    }
    if (clean.length !== 6 || !/^[A-Z0-9]{6}$/.test(clean)) {
      setError("Mã phòng gồm đúng 6 ký tự chữ hoặc số");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/vocab/game-room?code=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const payload = await res.json();
        if (payload?.success && payload?.data?.room) {
          const room = payload.data.room;
          const targetMode = room.gameMode === "rain" ? "rain" : "blast";
          const targetSetId = room.vocabSetId || 1;
          setIsOpen(false);
          router.push(`/vocab/${targetSetId}/flashcards?mode=${targetMode}&tab=play&room=${encodeURIComponent(clean)}`);
          return;
        }
      }
      setError("Mã phòng không tồn tại hoặc đã kết thúc");
    } catch {
      setError("Lỗi kết nối khi kiểm tra phòng, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="header-join-room-button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-3 text-xs sm:text-sm font-extrabold text-indigo-700 transition-all hover:bg-indigo-100 hover:border-indigo-300 active:scale-95 dark:border-indigo-800/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50 cursor-pointer shadow-sm shrink-0"
        title="Nhập mã phòng đấu đối kháng cùng bạn bè"
        aria-label="Nhập mã phòng đấu"
      >
        <span className="text-sm sm:text-base" aria-hidden="true">🔑</span>
        <span className="hidden md:inline">Nhập mã phòng</span>
        <span className="md:hidden">Mã phòng</span>
      </button>

      {isOpen && mounted && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-join-room-title"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Đóng"
            onClick={() => !loading && setIsOpen(false)}
          />
          <div className="relative w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-2xl z-10 m-auto">
            <button
              type="button"
              onClick={() => !loading && setIsOpen(false)}
              className="absolute right-4 top-4 text-xl text-muted hover:text-ink cursor-pointer"
              aria-label="Đóng"
            >
              ×
            </button>

            <div className="text-center space-y-1">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/10 text-2xl text-indigo-500">
                🔑
              </div>
              <h2 id="header-join-room-title" className="text-lg font-bold text-ink">
                Nhập mã phòng
              </h2>
              <p className="text-xs text-muted">
                Nhập mã 6 ký tự do bạn bè chia sẻ để tham gia phòng thi đấu
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={6}
                  value={code}
                  placeholder="VD: 7CWB2A"
                  disabled={loading}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError("");
                  }}
                  className="w-full rounded-xl border border-line bg-surface-soft px-4 py-3 text-center text-2xl font-black font-mono tracking-widest text-ink placeholder:font-normal placeholder:text-sm placeholder:tracking-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 uppercase"
                />
                {error && (
                  <p className="mt-1.5 text-center text-xs text-red-500 font-medium">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                  className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink2 hover:bg-surface-soft disabled:opacity-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={code.trim().length !== 6 || loading}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {loading ? "Đang vào..." : "Vào phòng"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
