import Link from "next/link";
import { getMistakeGroups } from "@/lib/services/mistake-review";

export default async function MistakeReviewList({ uid, listeningCursor, readingCursor }: { uid: string; listeningCursor?: string; readingCursor?: string }) {
  const results = await Promise.allSettled([getMistakeGroups(uid, "listening", listeningCursor), getMistakeGroups(uid, "reading", readingCursor)]);
  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-10 sm:px-6">
      <div>
        <h2 className="text-xl font-extrabold text-ink">Ôn câu nghe / đọc sai</h2>
        <p className="mt-1 text-sm text-muted">
          Gom theo từng đề & Part, ưu tiên câu sai nhiều lần rồi câu lâu chưa làm lại. Khi bạn trả lời đúng trong phiên ôn, câu đó sẽ tự động được gỡ khỏi danh sách sai.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {results.map((result, index) => {
          const isListening = index === 0;
          const totalInSkill = result.status === "fulfilled" ? result.value.groups.reduce((sum, g) => sum + g.count, 0) : 0;
          return (
            <div key={index} className="space-y-3 rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-ink">{isListening ? "🎧 Kỹ năng Nghe (Part 1–4)" : "📖 Kỹ năng Đọc (Part 5–7)"}</h3>
                {result.status === "fulfilled" && (
                  <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-extrabold tabular-nums text-muted">
                    {totalInSkill} câu cần sửa
                  </span>
                )}
              </div>
              {result.status === "rejected" ? (
                <p role="alert" className="text-sm text-danger-ink">Chưa tải được câu sai. Hãy tải lại trang để thử lại.</p>
              ) : (
                <>
                  {!result.value.groups.length && (
                    <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
                      Chưa có câu cần ôn ở kỹ năng này.
                    </p>
                  )}
                  <div className="space-y-2">
                    {result.value.groups.map((group) => (
                      <Link
                        prefetch={false}
                        key={group.key}
                        href={group.href}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-soft/50 p-3.5 no-underline transition-colors hover:border-primary hover:bg-surface-soft"
                      >
                        <span className="text-sm font-bold text-ink">{group.label}</span>
                        <strong className="shrink-0 text-xs font-extrabold text-primary">{group.count} câu · Ôn lại →</strong>
                      </Link>
                    ))}
                  </div>
                  {result.value.hasMore && result.value.nextCursor && (
                    <Link
                      href={`/vocab/review?${isListening ? "listeningCursor" : "readingCursor"}=${encodeURIComponent(result.value.nextCursor)}${isListening && readingCursor ? `&readingCursor=${encodeURIComponent(readingCursor)}` : !isListening && listeningCursor ? `&listeningCursor=${encodeURIComponent(listeningCursor)}` : ""}`}
                      className="inline-flex rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink no-underline hover:bg-surface-soft"
                    >
                      Xem thêm câu sai →
                    </Link>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
