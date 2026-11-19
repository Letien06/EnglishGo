"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-request";
import type { MembershipCheckout } from "@/types/payments";

const money = (amount: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
const button = "rounded-lg border border-control-line px-4 py-2.5 text-sm font-extrabold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";

export default function MembershipPanel() {
  const [checkout, setCheckout] = useState<MembershipCheckout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  const request = useCallback(async (url = "/api/payments/membership", method = "GET") => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(url, { method, cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || "Không thể kiểm tra gói tài khoản.");
      if (!controller.signal.aborted) setCheckout(result.data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Kết nối bị gián đoạn. Vui lòng thử lại.");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void request(), 0);
    return () => {
      clearTimeout(initial);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [request]);

  const order = checkout?.order;
  const orderId = order?.id;
  const orderStatus = order?.status;
  const premium = checkout?.membership.tier === "PREMIUM";
  useEffect(() => {
    if (!orderId || orderStatus !== "PENDING" || premium) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = () => void request(`/api/payments/orders/${encodeURIComponent(orderId)}`);
    const startPolling = (immediate: boolean) => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (document.visibilityState === "visible") {
        if (immediate) check();
        timer = setInterval(check, 5_000);
      }
    };
    // Avoid a 0ms duplicate poll immediately after initial membership fetch.
    startPolling(false);
    const onVisibility = () => startPolling(true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orderId, orderStatus, premium, request]);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`Đã sao chép ${label.toLocaleLowerCase("vi-VN")}.`);
    } catch {
      setNotice("Không thể sao chép tự động. Bạn có thể chọn và sao chép thông tin bên dưới.");
    }
  }

  return (
    <section id="membership" aria-labelledby="membership-title" className="mt-10 scroll-mt-24 space-y-5 border-t border-line pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="membership-title" className="text-xl font-extrabold text-ink">Gói tài khoản</h2>
        <span className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-extrabold text-primary-ink">
          {checkout ? premium ? "Premium" : "Thường" : "Đang kiểm tra…"}
        </span>
      </div>
      <p className="text-sm leading-6 text-muted">Đây là giai đoạn thử nghiệm cập nhật trạng thái Thường → Premium qua SePay. Tất cả tính năng học tập hiện giữ nguyên.</p>
      <div role="status" aria-live="polite" className="text-sm leading-6 text-ink2">
        {premium ? "Tài khoản của bạn đã được hệ thống xác nhận Premium." : order?.status === "EXPIRED" ? "Mã chuyển khoản đã hết hạn. Vui lòng tạo mã mới trước khi chuyển tiền." : order?.status === "PENDING" ? "Đang chờ ngân hàng xác nhận. Trạng thái được kiểm tra tự động khi bạn mở trang này." : checkout ? "Tài khoản của bạn đang ở gói Thường." : "Đang tải trạng thái tài khoản…"}
      </div>
      {checkout && !premium && !checkout.available && <p className="rounded-lg bg-surface p-4 text-sm text-muted">Chuyển khoản thử chưa được cấu hình. Vui lòng quay lại sau.</p>}
      {checkout && !premium && checkout.available && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <p className="font-extrabold text-ink">Số tiền chuyển khoản thử: {money(order?.status === "PENDING" ? order.amount : checkout.amount)}</p>
          <p className="mt-2 text-sm leading-6 text-muted">Nếu thanh toán, đây là giao dịch chuyển tiền thật qua ngân hàng. Chỉ chuyển đúng số tiền và nội dung của mã còn hiệu lực bên dưới.</p>
          {order?.status !== "PENDING" && <button type="button" disabled={busy} className={`${button} mt-4 border-transparent bg-primary text-gold-ink`} onClick={() => void request("/api/payments/orders", "POST")}>{busy ? "Đang tạo mã…" : "Tạo mã chuyển khoản thử"}</button>}
        </div>
      )}
      {!premium && order?.status === "PENDING" && (
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          <Image src={order.qrUrl} alt="Mã QR chuyển khoản thử Premium" width={200} height={240} unoptimized className="h-auto w-[200px] rounded-lg border border-line bg-white" />
          <div className="min-w-0 space-y-3">
            <dl className="space-y-3 text-sm">
              {[["Ngân hàng", order.bankName], ["Số tài khoản", order.accountNumber], ["Chủ tài khoản", order.accountName], ["Số tiền", money(order.amount)], ["Nội dung chuyển khoản", order.transferContent]].map(([label, value]) => (
                <div key={label} className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><dt className="text-muted">{label}</dt><dd className="mt-1 break-all font-extrabold text-ink select-text">{value}</dd></div>
                  <button type="button" className={`${button} px-2 py-1`} aria-label={`Sao chép ${label.toLocaleLowerCase("vi-VN")}`} onClick={() => void copy(label, label === "Số tiền" ? String(order.amount) : value)}>Sao chép</button>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-5 text-muted">Có hiệu lực đến {new Date(order.expiresAt).toLocaleString("vi-VN")}. Việc bấm kiểm tra không tự nâng cấp tài khoản.</p>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p role="status" aria-live="polite" className="text-sm text-muted">{notice}</p>
      <button type="button" disabled={busy} className={button} onClick={() => void request(order?.status === "PENDING" ? `/api/payments/orders/${encodeURIComponent(order.id)}` : undefined)}>{busy ? "Đang kiểm tra…" : error ? "Thử lại kiểm tra" : "Kiểm tra trạng thái"}</button>
    </section>
  );
}
