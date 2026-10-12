import Link from "next/link";
import { getMistakeGroups } from "@/lib/services/mistake-review";

export default async function MistakeReviewList({ uid, listeningCursor, readingCursor }: { uid: string; listeningCursor?: string; readingCursor?: string }) {
  const results = await Promise.allSettled([getMistakeGroups(uid, "listening", listeningCursor), getMistakeGroups(uid, "reading", readingCursor)]);
  return <section className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-6 sm:px-6">
    <h2 className="text-xl font-bold">Ôn câu nghe / đọc sai</h2>
    <p className="text-sm text-muted">Gom theo bài, ưu tiên câu sai nhiều rồi câu lâu chưa làm lại. Số lần sai bắt đầu được ghi từ bản cập nhật này.</p>
    {results.map((result, index) => <div key={index} className="space-y-2"><h3 className="font-bold">{index === 0 ? "Nghe" : "Đọc"}</h3>
      {result.status === "rejected" ? <p role="alert">Chưa tải được câu sai. Hãy tải lại trang để thử lại.</p>
        : <>{!result.value.groups.length && <p>Chưa có câu cần ôn.</p>}{result.value.groups.map((group) => <Link prefetch={false} key={group.key} href={group.href} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"><span>{group.label}</span><strong>{group.count} câu · Ôn lại →</strong></Link>)}
          {result.value.hasMore && result.value.nextCursor && <Link href={`/vocab/review?${index === 0 ? "listeningCursor" : "readingCursor"}=${encodeURIComponent(result.value.nextCursor)}${index === 0 && readingCursor ? `&readingCursor=${encodeURIComponent(readingCursor)}` : index === 1 && listeningCursor ? `&listeningCursor=${encodeURIComponent(listeningCursor)}` : ""}`} className="inline-flex rounded-lg border border-line px-3 py-2 text-sm font-semibold">Xem thêm câu sai →</Link>}</>}
    </div>)}
  </section>;
}
