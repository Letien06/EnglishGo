"use client";

import { useEffect, useMemo, useState } from "react";
import PetCat from "@/components/PetCat";
import type {
  PetCompanionId,
  PetDashboard,
  PetFoodId,
  PetLeaderboardEntry,
  PetLeaderboardScope,
} from "@/types/pet";

type Tab = "home" | "shop" | "inventory" | "leaderboard";
type ApiEnvelope<T> = { success: boolean; data: T | null; error: string | null };
type PetAction = { dashboard: PetDashboard; evolved: boolean };
const PET_PROFILE_UPDATED_EVENT = "englishgo:pet-profile-updated";

export default function PetDashboardClient({
  initialDashboard,
  initialLeaders,
  initialTab,
  currentUid,
}: {
  initialDashboard: PetDashboard;
  initialLeaders: PetLeaderboardEntry[];
  initialTab: Tab;
  currentUid: string;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [leaders, setLeaders] = useState(initialLeaders);
  const [leaderScope, setLeaderScope] = useState<PetLeaderboardScope>("weekly");
  const [petName, setPetName] = useState(initialDashboard.profile.name);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reacting, setReacting] = useState(false);

  const profile = dashboard.profile;
  const progress = profile.nextEvolutionCareXp
    ? Math.min(100, Math.round((profile.careXpTotal / profile.nextEvolutionCareXp) * 100))
    : 100;
  const inventory = useMemo(
    () => new Map(dashboard.inventory.map((item) => [item.foodId, item.quantity])),
    [dashboard.inventory],
  );

  useEffect(() => {
    if (tab !== "leaderboard" || leaderScope === "weekly") return;
    void loadLeaderboard("all-time");
  }, [tab, leaderScope]);

  async function request<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as ApiEnvelope<T>;
    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error || "Không thể cập nhật Mực lúc này.");
    }
    return payload.data;
  }

  async function buy(foodId: PetFoodId) {
    setBusy(`buy:${foodId}`);
    setMessage(null);
    try {
      const result = await request<PetAction>("/api/pet/shop/buy", "POST", { foodId });
      setDashboard(result.dashboard);
      window.dispatchEvent(new Event(PET_PROFILE_UPDATED_EVENT));
      setMessage("Đã thêm thức ăn vào kho của Mực.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể mua thức ăn.");
    } finally {
      setBusy(null);
    }
  }

  async function feed(foodId: PetFoodId) {
    setBusy(`feed:${foodId}`);
    setMessage(null);
    try {
      const result = await request<PetAction>("/api/pet/feed", "POST", { foodId });
      setDashboard(result.dashboard);
      window.dispatchEvent(new Event(PET_PROFILE_UPDATED_EVENT));
      setReacting(true);
      window.setTimeout(() => setReacting(false), 1_500);
      setMessage(result.evolved ? `Mực đã tiến hoá thành ${result.dashboard.profile.evolutionName}!` : "Mực ăn ngon lành và vui hơn rồi!");
      if (profile.rankOptIn) void loadLeaderboard(leaderScope);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cho Mực ăn.");
    } finally {
      setBusy(null);
    }
  }

  async function saveProfile(next: {
    name?: string;
    rankOptIn?: boolean;
    floatingEnabled?: boolean;
    equippedCompanionId?: PetCompanionId;
  }) {
    setBusy("profile");
    setMessage(null);
    try {
      const updated = await request<PetDashboard>("/api/pet/profile", "PATCH", next);
      setDashboard(updated);
      window.dispatchEvent(new Event(PET_PROFILE_UPDATED_EVENT));
      setPetName(updated.profile.name);
      setMessage(
        next.floatingEnabled === false
          ? "Đã ẩn pet nổi trên các trang. Bạn vẫn có thể bật lại ở Nhà Mèo."
          : next.floatingEnabled === true
            ? "Pet nổi đã hiện lại trên các trang."
            : next.equippedCompanionId
              ? `${updated.profile.name} đã đổi người bạn đồng hành.`
              : next.rankOptIn === false
                ? "Mực đã ẩn khỏi bảng xếp hạng."
                : "Đã lưu thông tin của Mực.",
      );
      if (next.rankOptIn) void loadLeaderboard(leaderScope);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu thông tin.");
    } finally {
      setBusy(null);
    }
  }

  async function buyCompanion(companionId: Exclude<PetCompanionId, "MUC">) {
    setBusy(`companion:${companionId}`);
    setMessage(null);
    try {
      const result = await request<PetAction>("/api/pet/companions/buy", "POST", { companionId });
      setDashboard(result.dashboard);
      window.dispatchEvent(new Event(PET_PROFILE_UPDATED_EVENT));
      setMessage(`${result.dashboard.profile.name} đã chào đón pet mới và tự động trang bị ngay!`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đổi pet mới.");
    } finally {
      setBusy(null);
    }
  }

  async function loadLeaderboard(scope: PetLeaderboardScope) {
    setBusy("leaderboard");
    try {
      const response = await fetch(`/api/pet/leaderboard?scope=${scope}`, { cache: "no-store" });
      const payload = await response.json() as ApiEnvelope<PetLeaderboardEntry[]>;
      if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || "Không tải được bảng xếp hạng.");
      setLeaders(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được bảng xếp hạng.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-canvas flex-1 overflow-y-auto px-4 py-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="pet-hero overflow-hidden rounded-3xl p-5 sm:p-7">
          <div className="pet-hero-glow" aria-hidden="true" />
          <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-extrabold text-primary">Mèo đồng hành</span>
                <span className="rounded-full bg-slate-950/5 px-3 py-1 text-xs font-extrabold text-ink">Cấp {profile.evolutionStage}</span>
              </div>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{profile.name} · {profile.evolutionName}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-ink2">Hoàn thành bài học để kiếm Mèo Xu, đổi thức ăn và giúp Mực trưởng thành. Mèo chỉ cổ vũ bạn — không bao giờ phạt khi bạn bận.</p>
              <div className="mt-5 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric icon="🪙" label="Mèo Xu" value={dashboard.wallet.balance} />
                <Metric icon="♥" label="No bụng" value={`${profile.fullness}%`} />
                <Metric icon="✦" label="Vui vẻ" value={`${profile.happiness}%`} />
                <Metric icon="🍽" label="Bữa ăn" value={profile.totalFeedings} />
              </div>
              <div className="mt-5 max-w-xl rounded-2xl border border-white/65 bg-white/55 p-3 backdrop-blur-sm">
                <div className="flex justify-between gap-3 text-xs font-extrabold text-ink"><span>Điểm chăm sóc</span><span>{profile.careXpTotal}{profile.nextEvolutionCareXp ? ` / ${profile.nextEvolutionCareXp}` : " · Tối đa"}</span></div>
                <div className="pet-progress mt-2 h-2"><span style={{ width: `${progress}%` }} /></div>
                <p className="mt-2 text-xs font-semibold text-muted">{profile.nextEvolutionCareXp ? `Còn ${profile.nextEvolutionCareXp - profile.careXpTotal} điểm để Mực tiến hoá.` : "Mực đã đạt hình thái cao nhất!"}</p>
              </div>
            </div>
            <div className="pet-hero-cat">
              <PetCat mood={profile.mood} stage={profile.evolutionStage} companionId={profile.equippedCompanionId} reacting={reacting} />
            </div>
          </div>
        </section>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Khu vực Mèo cưng">
          <TabButton active={tab === "home"} onClick={() => setTab("home")}>Nhà Mèo</TabButton>
          <TabButton active={tab === "shop"} onClick={() => setTab("shop")}>Cửa hàng</TabButton>
          <TabButton active={tab === "inventory"} onClick={() => setTab("inventory")}>Kho đồ</TabButton>
          <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>Bảng xếp hạng</TabButton>
        </nav>

        {message ? <p role="status" className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-bold text-primary">{message}</p> : null}

        {tab === "home" ? (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="premium-card p-5 sm:p-6">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Tình trạng hôm nay</p>
              <h2 className="mt-1 text-xl font-extrabold text-ink">{moodCopy(profile.mood, profile.name)}</h2>
              <div className="mt-5 space-y-4">
                <StatusBar label="No bụng" emoji="♥" value={profile.fullness} color="rose" />
                <StatusBar label="Vui vẻ" emoji="✦" value={profile.happiness} color="amber" />
              </div>
              <button type="button" onClick={() => setTab("inventory")} className="premium-primary mt-6 inline-flex px-4 py-2 text-sm">Mở kho và cho ăn</button>
            </article>
            <article className="premium-card p-5 sm:p-6">
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Thông tin công khai</p>
              <h2 className="mt-1 text-xl font-extrabold text-ink">Đặt tên cho người bạn học</h2>
              <label className="mt-5 block text-xs font-extrabold text-muted" htmlFor="pet-name">Tên mèo</label>
              <div className="mt-2 flex gap-2">
                <input id="pet-name" value={petName} maxLength={24} onChange={(event) => setPetName(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-bold text-ink outline-none focus:border-primary" />
                <button type="button" disabled={busy === "profile" || petName.trim() === profile.name} onClick={() => void saveProfile({ name: petName })} className="rounded-xl bg-ink px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">Lưu</button>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-soft p-4">
                <input type="checkbox" checked={profile.rankOptIn} disabled={busy === "profile"} onChange={(event) => void saveProfile({ rankOptIn: event.target.checked })} className="mt-0.5 h-4 w-4 accent-primary" />
                <span><strong className="block text-sm text-ink">Hiển thị Mực trên BXH</strong><small className="mt-1 block leading-5 text-muted">Chỉ hiển thị tên mèo, nickname, cấp và Điểm chăm sóc. Email không bao giờ được công khai.</small></span>
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <input type="checkbox" checked={profile.floatingEnabled} disabled={busy === "profile"} onChange={(event) => void saveProfile({ floatingEnabled: event.target.checked })} className="mt-0.5 h-4 w-4 accent-primary" />
                <span><strong className="block text-sm text-ink">Hiện pet nổi trên các trang</strong><small className="mt-1 block leading-5 text-muted">Bạn có thể kéo pet đi bất kỳ đâu. Tắt mục này để tập trung; Nhà Mèo vẫn luôn mở từ header.</small></span>
              </label>
            </article>
          </section>
        ) : null}

        {tab === "home" ? (
          <section className="premium-card p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-extrabold uppercase tracking-widest text-muted">Tủ pet</p><h2 className="mt-1 text-xl font-extrabold text-ink">Chọn người bạn đồng hành</h2></div>
              <button type="button" onClick={() => setTab("shop")} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-extrabold text-ink">Khám phá pet mới</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {dashboard.companionCatalog.filter((companion) => dashboard.ownedCompanionIds.includes(companion.id)).map((companion) => {
                const selected = profile.equippedCompanionId === companion.id;
                return <button key={companion.id} type="button" disabled={selected || busy === "profile"} onClick={() => void saveProfile({ equippedCompanionId: companion.id })} className={`pet-companion-card ${selected ? "is-selected" : ""}`}>
                  <PetCat mood={profile.mood} stage={profile.evolutionStage} companionId={companion.id} compact />
                  <span className="min-w-0 text-left"><strong className="block truncate text-sm text-ink">{companion.name}</strong><small className="mt-0.5 block text-xs font-bold text-muted">{selected ? "Đang đồng hành" : "Trang bị"}</small></span>
                </button>;
              })}
            </div>
          </section>
        ) : null}

        {tab === "shop" ? (
          <section className="space-y-6">
            <div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-muted">Mèo mới</p><h2 className="mt-1 text-xl font-extrabold text-ink">Đổi pet bằng Mèo Xu</h2></div><p className="text-sm font-bold text-muted">Số dư: <span className="text-primary">🪙 {dashboard.wallet.balance}</span></p></div>
              <div className="grid gap-4 lg:grid-cols-3">
                {dashboard.companionCatalog.map((companion) => {
                  const owned = dashboard.ownedCompanionIds.includes(companion.id);
                  const selected = profile.equippedCompanionId === companion.id;
                  return <article key={companion.id} className={`pet-shop-companion pet-shop-companion--${companion.rarity}`}>
                    <PetCat mood={profile.mood} stage={profile.evolutionStage} companionId={companion.id} />
                    <div className="relative min-w-0"><span className="pet-rarity">{companion.rarity === "starter" ? "Khởi đầu" : companion.rarity === "rare" ? "Hiếm" : "Huyền thoại"}</span><h3 className="mt-2 text-xl font-extrabold text-ink">{companion.name}</h3><p className="mt-1 text-sm leading-6 text-muted">{companion.description}</p><button type="button" disabled={selected || busy === `companion:${companion.id}`} onClick={() => companion.id === "MUC" || owned ? void saveProfile({ equippedCompanionId: companion.id }) : void buyCompanion(companion.id)} className="premium-primary mt-4 w-full text-sm disabled:cursor-not-allowed disabled:opacity-60">{selected ? "Đang đồng hành" : owned ? "Trang bị" : `🪙 ${companion.price} · Đổi pet`}</button></div>
                  </article>;
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-muted">Đồ ăn</p><h2 className="mt-1 text-xl font-extrabold text-ink">Tích trữ cho hành trình học</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {dashboard.catalog.map((food) => (
                  <article key={food.id} className="premium-card flex min-h-64 flex-col p-5">
                    <span className="text-4xl" aria-hidden="true">{food.icon}</span>
                    <h3 className="mt-4 text-lg font-extrabold text-ink">{food.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{food.description}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-extrabold"><span className="rounded-lg bg-rose-50 py-2 text-rose-700">♥ +{food.fullness}</span><span className="rounded-lg bg-amber-50 py-2 text-amber-700">✦ +{food.happiness}</span><span className="rounded-lg bg-primary/10 py-2 text-primary">+{food.careXp} XP</span></div>
                    <button type="button" disabled={busy === `buy:${food.id}`} onClick={() => void buy(food.id)} className="mt-auto premium-primary pt-2 text-sm disabled:opacity-60">🪙 {food.price} · Mua</button>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "inventory" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.catalog.map((food) => {
              const count = inventory.get(food.id) ?? 0;
              return <article key={food.id} className="premium-card p-5">
                <div className="flex items-start justify-between gap-3"><span className="text-4xl" aria-hidden="true">{food.icon}</span><span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-extrabold text-ink">× {count}</span></div>
                <h2 className="mt-4 text-lg font-extrabold text-ink">{food.name}</h2>
                <p className="mt-1 text-sm text-muted">+{food.careXp} Điểm chăm sóc</p>
                <button type="button" disabled={count <= 0 || busy === `feed:${food.id}`} onClick={() => void feed(food.id)} className="premium-primary mt-5 w-full text-sm disabled:cursor-not-allowed disabled:opacity-50">{count > 0 ? `Cho ${profile.name} ăn` : "Hết trong kho"}</button>
              </article>;
            })}
          </section>
        ) : null}

        {tab === "leaderboard" ? (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="premium-card overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
                <div><p className="text-xs font-extrabold uppercase tracking-widest text-muted">Cuộc đua nhẹ nhàng</p><h2 className="mt-1 text-xl font-extrabold text-ink">Ai chăm mèo đều đặn nhất?</h2></div>
                <div className="flex rounded-xl bg-surface-soft p-1">
                  <ScopeButton active={leaderScope === "weekly"} onClick={() => { setLeaderScope("weekly"); void loadLeaderboard("weekly"); }}>Tuần này</ScopeButton>
                  <ScopeButton active={leaderScope === "all-time"} onClick={() => setLeaderScope("all-time")}>Tổng</ScopeButton>
                </div>
              </div>
              <div className="border-t border-line">
                {leaders.length ? leaders.map((entry) => <LeaderboardRow key={entry.uid} entry={entry} mine={entry.uid === currentUid} />) : <p className="p-8 text-center text-sm font-semibold text-muted">Chưa có bạn nào trên bảng tuần này. Hãy là người đầu tiên!</p>}
              </div>
            </article>
            <article className="premium-card p-5 sm:p-6"><p className="text-xs font-extrabold uppercase tracking-widest text-muted">Cách tính</p><h2 className="mt-1 text-xl font-extrabold text-ink">Cạnh tranh lành mạnh</h2><ul className="mt-5 space-y-4 text-sm leading-6 text-muted"><li><strong className="text-ink">Tuần này:</strong> Điểm chăm sóc từ thức ăn đã cho Mực ăn trong tuần.</li><li><strong className="text-ink">Tổng:</strong> Tổng Điểm chăm sóc để khoe hành trình dài hạn và cấp tiến hoá.</li><li><strong className="text-ink">Riêng tư:</strong> Bạn phải tự bật hiển thị trên BXH; email luôn được ẩn.</li></ul></article>
          </section>
        ) : null}

        {tab === "home" ? <section className="premium-card p-5 sm:p-6"><p className="text-xs font-extrabold uppercase tracking-widest text-muted">Nhật ký gần đây</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dashboard.history.map((entry) => <div key={entry.id} className="rounded-2xl border border-line bg-surface-soft p-4"><p className="text-sm font-extrabold text-ink">{entry.title}</p><p className="mt-1 text-xs font-bold text-primary">{entry.type === "PURCHASE" ? `${entry.amount} Mèo Xu` : entry.type === "FEED" ? `+${entry.amount} Điểm chăm sóc` : `+${entry.amount} Mèo Xu`}</p><time className="mt-2 block text-xs text-muted">{formatDate(entry.occurredAtMillis)}</time></div>)}</div></section> : null}
      </div>
    </main>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${active ? "bg-primary text-gold-ink" : "border border-line bg-surface text-ink hover:bg-surface-soft"}`}>{children}</button>;
}

function ScopeButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold ${active ? "bg-surface text-primary shadow-sm" : "text-muted"}`}>{children}</button>;
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/65 bg-white/55 px-3 py-3 backdrop-blur-sm"><small className="block text-[10px] font-bold text-muted">{icon} {label}</small><strong className="mt-1 block text-base font-extrabold text-ink">{value}</strong></div>;
}

function StatusBar({ label, emoji, value, color }: { label: string; emoji: string; value: number; color: "rose" | "amber" }) {
  return <div><div className="flex justify-between text-sm font-extrabold text-ink"><span>{emoji} {label}</span><span>{value}%</span></div><div className={`mt-2 h-2 overflow-hidden rounded-full ${color === "rose" ? "bg-rose-100" : "bg-amber-100"}`}><span className={`block h-full rounded-full ${color === "rose" ? "bg-rose-500" : "bg-amber-400"}`} style={{ width: `${value}%` }} /></div></div>;
}

function LeaderboardRow({ entry, mine }: { entry: PetLeaderboardEntry; mine: boolean }) {
  return <div className={`flex items-center gap-3 px-5 py-4 sm:px-6 ${mine ? "bg-primary/5" : ""}`}><strong className={`w-7 text-center text-sm ${entry.rank <= 3 ? "text-primary" : "text-muted"}`}>#{entry.rank}</strong><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-lg">🐈</span><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{entry.petName}</strong><span className="block truncate text-xs text-muted">{entry.displayName || "Một người học"} · Cấp {entry.evolutionStage}</span></div><strong className="text-sm text-primary">{entry.score.toLocaleString()} XP</strong></div>;
}

function moodCopy(mood: PetDashboard["profile"]["mood"], name: string) {
  return mood === "happy" ? `${name} đang rất vui!` : mood === "hungry" ? `${name} hơi đói rồi` : mood === "sleepy" ? `${name} muốn một chút quan tâm` : `${name} đang đồng hành cùng bạn`;
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}
