import Link from "next/link";
import { getMistakeGroups } from "@/lib/services/mistake-review";

export default async function MistakeReviewList({ uid }: { uid: string }) {
  const results = await Promise.allSettled([getMistakeGroups(uid, "listening"), getMistakeGroups(uid, "reading")]);
  return <section className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-6 sm:px-6">
    <h2 className="text-xl font-bold">Ôn câu nghe / đọc sai</h2>
    <p className="text-sm text-muted">Gom theo bài, ưu tiên câu sai nhiều rồi câu lâu chưa làm lại. Số lần sai bắt đầu được ghi từ bản cập nhật này.</p>
    {results.map((result, index) => <div key={index} className="space-y-2"><h3 className="font-bold">{index === 0 ? "Nghe" : "Đọc"}</h3>
      {result.status === "rejected" ? <p role="alert">Chưa tải được câu sai. Hãy tải lại trang để thử lại.</p>
        : <>{!result.value.groups.length && <p>Chưa có câu cần ôn.</p>}{result.value.groups.map((group) => <Link prefetch={false} key={group.key} href={group.href} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"><span>{group.label}</span><strong>{group.count} câu · Ôn lại →</strong></Link>)}
          {result.value.hasMore && <p className="text-sm text-muted">Đang hiển thị tối đa 200 câu sai mỗi kỹ năng. Hoàn thành rồi quay lại để xem thêm.</p>}</>}
    </div>)}
  </section>;
}
