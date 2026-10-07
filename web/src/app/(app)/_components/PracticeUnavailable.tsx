"use client";

import { useRouter } from "next/navigation";
import Link from "@/components/IntentLink";

export default function PracticeUnavailable({ skill, partId, empty = false }: {
  skill: "listening" | "reading";
  partId: string;
  empty?: boolean;
}) {
  const router = useRouter();
  const label = skill === "listening" ? "nghe" : "đọc";
  const catalog = skill === "listening" ? "/listen" : "/read";
  return (
    <main className="design-system flex min-h-dvh items-center justify-center bg-bg px-4 py-8 sm:px-6">
      <section role="alert" className="w-full max-w-xl rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Luyện {label}</p>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">{empty ? "Bài này chưa có câu hỏi" : `Chưa mở được bài luyện ${label}`}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{empty ? "Bạn có thể chọn bài khác để tiếp tục luyện tập." : "Dữ liệu đang tạm gián đoạn. Thử tải lại hoặc chọn bài khác; tiến độ đã lưu vẫn được giữ nguyên."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!empty && <button type="button" onClick={() => router.refresh()} className="premium-primary min-h-11 px-5 py-2.5 text-sm">Thử lại</button>}
          <Link href={`${catalog}?part=${partId}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-5 py-2.5 text-sm font-extrabold text-ink">Quay lại danh sách bài</Link>
        </div>
      </section>
    </main>
  );
}
