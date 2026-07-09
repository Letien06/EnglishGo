"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import ThemeToggle from "@/components/ThemeToggle";
import { getClientAuth } from "@/lib/firebase/client";

type AuthMode = "login" | "register";

function beginLoginOverdelay(waitFor: string | null) {
  window.dispatchEvent(new CustomEvent("englishgo:overdelay-begin", {
    detail: {
      label: "Đang đăng nhập...",
      timeout: 15000,
      waitFor,
    },
  }));
}

function finishLoginOverdelay(waitFor: string | null) {
  window.dispatchEvent(new CustomEvent("englishgo:overdelay-ready", {
    detail: waitFor ? { key: waitFor } : { force: true },
  }));
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const from = getSafeReturnPath(searchParams.get("from") || searchParams.get("redirect") || "/hub");
  const initialMode: AuthMode = searchParams.get("mode") === "register" ? "register" : "login";

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AuthMode>(initialMode);

  const createBackendSession = useCallback(
    async (firebaseUser: { getIdToken: () => Promise<string> }) => {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `Máy chủ đăng nhập trả về ${res.status}: ${text.slice(0, 120)}`,
        );
      }
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(
          result.error || result.message || `Đăng nhập thất bại (${res.status})`,
        );
      }
      window.location.replace(from);
    },
    [from],
  );

  useEffect(() => {
    let cancelled = false;

    async function finishRedirectLogin() {
      try {
        const result = await getRedirectResult(getClientAuth());
        if (!result) return;
        if (!cancelled) {
          setError("");
          setBusy(true);
          beginLoginOverdelay(from.startsWith("/hub") ? "hub-ready" : null);
        }
        await createBackendSession(result.user);
      } catch (err: unknown) {
        if (!cancelled) {
          finishLoginOverdelay(from.startsWith("/hub") ? "hub-ready" : null);
          setError(friendlyAuthError(err));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void finishRedirectLogin();

    return () => {
      cancelled = true;
    };
  }, [createBackendSession, from]);

  const runAuth = useCallback(async (callback: () => Promise<void>) => {
    setError("");
    setBusy(true);
    const waitFor = from.startsWith("/hub") ? "hub-ready" : null;
    beginLoginOverdelay(waitFor);
    try {
      await callback();
    } catch (err: unknown) {
      finishLoginOverdelay(waitFor);
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }, [from]);

  const handleGoogle = () =>
    runAuth(async () => {
      const provider = new GoogleAuthProvider();
      const auth = getClientAuth();
      try {
        const credential = await signInWithPopup(auth, provider);
        await createBackendSession(credential.user);
      } catch (err: unknown) {
        if (!shouldFallbackToRedirect(err)) throw err;
        await signInWithRedirect(auth, provider);
      }
    });

  return (
    <main className="relative flex min-h-dvh flex-col lg:flex-row">
      {busy && <LoginLoadingNotice />}

      <section className="flex flex-1 flex-col items-center justify-center bg-surface px-6 py-12">
        <Link href="/" className="mb-8 flex items-center gap-3 no-underline">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-extrabold text-gold-ink">
            E
          </span>
          <strong className="text-xl font-extrabold tracking-tight text-ink">
            ENGLISHGO
          </strong>
        </Link>

        <div className="w-full max-w-md rounded-2xl border border-line bg-surface-soft p-7 shadow-[0_18px_55px_rgba(15,27,45,0.08)]">
          <h1 className="mb-1 text-2xl font-extrabold text-ink">
            {mode === "register" ? "Tạo tài khoản ENGLISHGO" : "Chào mừng trở lại"}
          </h1>
          <p className="mb-6 text-sm text-muted">
            {mode === "register"
              ? "Đăng ký miễn phí bằng Google để bắt đầu lưu tiến độ học."
              : "Tiếp tục với Google để vào lại tài khoản của bạn."}
          </p>

          <div className="mb-4 grid grid-cols-2 rounded-xl border border-line bg-bg p-1 text-sm font-extrabold">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className={`rounded-lg px-3 py-2 ${
                mode === "login" ? "bg-primary text-gold-ink" : "text-muted hover:text-ink"
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
              }}
              className={`rounded-lg px-3 py-2 ${
                mode === "register" ? "bg-primary text-gold-ink" : "text-muted hover:text-ink"
              }`}
            >
              Đăng ký
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-extrabold text-ink transition-colors hover:bg-surface-soft disabled:opacity-50"
          >
            <span className="text-lg font-extrabold text-primary">G</span>
            <strong>Tiếp tục với Google</strong>
          </button>

          {error && (
            <div className="mt-4 rounded-lg bg-crimson/10 p-3 text-sm text-crimson" role="alert">
              {error}
            </div>
          )}

          <p className="mt-5 text-center text-xs text-muted">
            {mode === "register" ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <button
              type="button"
              onClick={() => {
                const nextMode = mode === "register" ? "login" : "register";
                setMode(nextMode);
                setError("");
              }}
              className="font-semibold text-primary hover:underline"
            >
              {mode === "register" ? "Đăng nhập" : "Đăng ký"}
            </button>
          </p>
        </div>

        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>

      <section className="hidden flex-1 flex-col items-center justify-center bg-bg px-10 py-12 lg:flex">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-4xl font-extrabold text-gold-ink">
          E
        </div>
        <h2 className="mb-2 text-center text-3xl font-extrabold text-ink">
          Chinh phục TOEIC cùng ENGLISHGO
        </h2>
        <p className="mb-8 max-w-md text-center text-sm leading-relaxed text-muted">
          Nền tảng luyện thi TOEIC toàn diện: luyện nghe, ngữ pháp, từ vựng, đề thi thử và đọc hiểu.
        </p>

        <div className="grid w-full max-w-sm grid-cols-2 gap-4">
          {[
            { icon: "♪", count: "7773+", label: "Bài nghe" },
            { icon: "▥", count: "997+", label: "Câu hỏi" },
            { icon: "▧", count: "75+", label: "Đề thi" },
            { icon: "▤", count: "37659+", label: "Học viên" },
          ].map((stat) => (
            <article
              key={stat.label}
              className="flex flex-col items-center rounded-xl border border-line bg-surface p-5"
            >
              <span className="mb-2 text-xl text-primary">{stat.icon}</span>
              <strong className="text-xl font-extrabold text-ink">{stat.count}</strong>
              <small className="text-xs text-muted">{stat.label}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function getSafeReturnPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/hub";
  return path;
}

function isFirebaseAuthCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code;
}

function shouldFallbackToRedirect(error: unknown): boolean {
  return isFirebaseAuthCode(error, "auth/popup-blocked") ||
    isFirebaseAuthCode(error, "auth/operation-not-supported-in-this-environment") ||
    isFirebaseAuthCode(error, "auth/cancelled-popup-request");
}

function friendlyAuthError(error: unknown): string {
  if (isFirebaseAuthCode(error, "auth/popup-closed-by-user")) {
    return "Bạn đã đóng cửa sổ Google trước khi hoàn tất.";
  }
  if (isFirebaseAuthCode(error, "auth/popup-blocked")) {
    return "Trình duyệt đang chặn cửa sổ Google. Vui lòng cho phép popup rồi thử lại.";
  }
  if (isFirebaseAuthCode(error, "auth/account-exists-with-different-credential")) {
    return "Tài khoản Google này đã liên kết với phương thức đăng nhập khác.";
  }
  if (isFirebaseAuthCode(error, "auth/unauthorized-domain")) {
    return "Tên miền hiện tại chưa được cho phép trong Firebase Authentication.";
  }
  if (isFirebaseAuthCode(error, "auth/invalid-api-key")) {
    return "Cấu hình Firebase đăng nhập đang thiếu hoặc không hợp lệ.";
  }
  if (isFirebaseAuthCode(error, "auth/network-request-failed")) {
    return "Không kết nối được Google/Firebase. Vui lòng kiểm tra mạng rồi thử lại.";
  }
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định";
}

function LoginLoadingNotice() {
  return (
    <div className="app-busy-notice">
      <div className="app-busy-card">
        <span className="app-busy-spinner" />
        <div>
          <p className="app-busy-title">
            Đang đăng nhập
          </p>
          <p className="app-busy-description">
            Đang kết nối máy chủ, vui lòng chờ...
          </p>
        </div>
      </div>
    </div>
  );
}
