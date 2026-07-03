"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import ThemeToggle from "@/components/ThemeToggle";
import { getClientAuth } from "@/lib/firebase/client";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/hub";

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
      router.push(from);
    },
    [router, from],
  );

  const runAuth = useCallback(async (callback: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await callback();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleGoogle = () =>
    runAuth(async () => {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(getClientAuth(), provider);
      await createBackendSession(credential.user);
    });

  const handleEmail = (event: React.FormEvent) => {
    event.preventDefault();
    runAuth(async () => {
      const credential = await signInWithEmailAndPassword(
        getClientAuth(),
        email,
        password,
      );
      await createBackendSession(credential.user);
    });
  };

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
          <h1 className="mb-1 text-2xl font-extrabold text-ink">Chào mừng trở lại</h1>
          <p className="mb-6 text-sm text-muted">
            Đăng nhập nhanh bằng Google để tiếp tục học.
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-extrabold text-ink transition-colors hover:bg-surface-soft disabled:opacity-50"
          >
            <span className="text-lg font-extrabold text-primary">G</span>
            <strong>Đăng nhập với Google</strong>
          </button>

          <button
            type="button"
            onClick={() => setShowEmail((value) => !value)}
            className="mt-3 w-full text-center text-xs text-muted transition-colors hover:text-ink2"
          >
            Đã có tài khoản email? Đăng nhập bằng email/mật khẩu ⌄
          </button>

          {showEmail && (
            <form onSubmit={handleEmail} className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-semibold text-ink2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-semibold text-ink2">
                  Mật khẩu
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-extrabold text-gold-ink transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Đăng nhập
              </button>
            </form>
          )}

          {error && (
            <div className="mt-4 rounded-lg bg-crimson/10 p-3 text-sm text-crimson" role="alert">
              {error}
            </div>
          )}

          <p className="mt-5 text-center text-xs text-muted">
            Chưa có tài khoản?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Đăng ký
            </Link>
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

function LoginLoadingNotice() {
  return (
    <div className="fixed right-5 top-5 z-[90] w-[310px] rounded-2xl border border-primary/25 bg-[#151217]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-[#23c58b] border-r-[#ff4e9d] border-t-[#2879ff]" />
        <div>
          <p className="bg-gradient-to-r from-[#ef4da0] to-[#3177ff] bg-clip-text text-sm font-extrabold text-transparent">
            Đang đăng nhập
          </p>
          <p className="text-xs font-bold text-stone-300">
            Đang kết nối máy chủ, vui lòng chờ...
          </p>
        </div>
      </div>
    </div>
  );
}
