import LogoutButton from "@/components/LogoutButton";
import { requireUserForRead } from "@/lib/auth/session";
import { getSettings } from "@/lib/services/account";
import AccountForms from "./AccountForms";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUserForRead();
  const settings = getSettings(user);

  return (
    <main className="account-page app-canvas min-h-[calc(100dvh-4rem)] px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <header className="page-heading mb-8 flex items-end justify-between border-b border-amber-200 pb-8">
          <div>
            <span className="inline-flex rounded-full bg-primary/10 px-4 py-1 text-xs font-extrabold uppercase text-emerald-700">
              Tài khoản
            </span>
            <h1 className="mt-4 text-5xl font-extrabold text-ink">Thông tin cá nhân</h1>
            <p className="mt-3 text-lg text-muted">
              Chỉnh sửa tên hiển thị, ảnh đại diện và thông tin đăng nhập của bạn.
            </p>
          </div>
          <LogoutButton />
        </header>

        <div className="grid gap-6 lg:grid-cols-[290px_1fr]">
          <aside className="account-side-nav h-fit rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-4 px-2 text-base font-extrabold uppercase text-ink">Tài khoản</h2>
            <nav className="space-y-2">
              <a className="flex items-center gap-3 rounded-lg bg-primary/10 px-4 py-3 font-extrabold text-primary" href="#profile">
                <span>♟</span>
                Thông tin cá nhân
              </a>
              <a className="flex items-center gap-3 rounded-lg px-4 py-3 font-extrabold text-ink2" href="#password">
                <span>🔒</span>
                Đổi mật khẩu
              </a>
              <a className="flex items-center gap-3 rounded-lg px-4 py-3 font-extrabold text-ink2" href="#devices">
                <span>▯</span>
                Thiết bị
              </a>
            </nav>
          </aside>

          <section className="account-content rounded-xl bg-white p-6 shadow-sm sm:p-8">
            <AccountForms settings={settings} />
          </section>
        </div>
      </div>
    </main>
  );
}
