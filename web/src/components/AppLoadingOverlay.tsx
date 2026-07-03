"use client";

import { usePathname } from "next/navigation";

function labelForPath(pathname: string): string {
  if (pathname.startsWith("/listen")) return "phần Nghe";
  if (pathname.startsWith("/read")) return "phần Đọc";
  if (pathname.startsWith("/vocab")) return "phần Từ vựng";
  if (pathname.startsWith("/account")) return "Tài khoản";
  return "nội dung học";
}

export default function AppLoadingOverlay() {
  const pathname = usePathname();
  const label = labelForPath(pathname);

  return (
    <div className="fixed right-5 top-20 z-[80] w-[300px] rounded-2xl border border-primary/25 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 shrink-0 animate-spin rounded-full border-4 border-[#23c58b] border-r-[#ff4e9d] border-t-[#2879ff]" />
        <div>
          <p className="bg-gradient-to-r from-[#ef4da0] to-[#3177ff] bg-clip-text text-sm font-extrabold text-transparent">
            Đang mở {label}
          </p>
          <p className="text-xs font-bold text-slate-500">
            Đang tải dữ liệu luyện tập...
          </p>
        </div>
      </div>
    </div>
  );
}
