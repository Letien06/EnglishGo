/**
 * Listening Practice — `/listen/practice`
 *
 * Server component that loads the practice session data from DauToeic,
 * then renders the client-side interactive practice component.
 *
 * Port of `ListenController.practice()` + `listen/practice.html`.
 */
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import { DAUTOEIC_LEVEL_COUNT } from "@/lib/services/dautoeic-source";
import * as listening from "@/lib/services/listening";
import ListenPracticeClient from "./ListenPracticeClient";

function partNumber(partId: string): number {
  switch (partId) {
    case "part1": return 1;
    case "part2": return 2;
    case "part3": return 3;
    case "part4": return 4;
    default: return 1;
  }
}

export default async function ListenPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string; level?: string; mode?: string; assist?: string }>;
}) {
  const params = await searchParams;
  const partId = params.part && ["part1", "part2", "part3", "part4"].includes(params.part)
    ? params.part
    : "part1";
  const pNum = partNumber(partId);
  const level = Math.max(1, Math.min(DAUTOEIC_LEVEL_COUNT, Math.trunc(Number(params.level)) || 1));

  const mode = (() => {
    switch (params.mode) {
      case "bilingual":
      case "fill":
      case "flip":
        return params.mode;
      default:
        return "normal";
    }
  })();

  const assist = (() => {
    const v = Number(params.assist);
    switch (v) {
      case 30:
      case 50:
      case 100:
        return v;
      default:
        return 30;
    }
  })();

  const user = await getCurrentUserForRead();

  let session;
  try {
    session = await dautoeic.getDifficultySession(pNum, level, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("listen-practice-session-failed", {
      part: pNum,
      level,
      message,
    });
    return <PracticeLoadError partId={partId} partNum={pNum} level={level} reason="Không tải được dữ liệu bài luyện." detail={message} />;
  }

  if (!session || session.items.length === 0) {
    console.warn("listen-practice-session-empty", {
      part: pNum,
      level,
      total: session?.total ?? 0,
    });
    return (
      <PracticeLoadError
        partId={partId}
        partNum={pNum}
        level={level}
        reason="Session đã tải nhưng không có câu hỏi để luyện."
        detail={`total=${session?.total ?? 0}, items=${session?.items.length ?? 0}`}
      />
    );
  }

  // Restore previously saved answers so the practice UI resumes where the
  // learner left off (fixes progress showing on dashboard but resetting here).
  let savedAnswers: Record<string, string> = {};
  if (user) {
    try {
      savedAnswers = await listening.loadAnswers(user.uid, pNum, level);
    } catch {
      // Best-effort: fall back to a fresh session if progress cannot be read.
      savedAnswers = {};
    }
  }

  return (
    <ListenPracticeClient
      session={session}
      partId={partId}
      partNum={pNum}
      level={level}
      mode={mode}
      assist={assist}
      userLoggedIn={!!user}
      userUid={user?.uid ?? null}
      savedAnswers={savedAnswers}
    />
  );
}

function PracticeLoadError({
  partId,
  partNum,
  level,
  reason,
  detail,
}: {
  partId: string;
  partNum: number;
  level: number;
  reason: string;
  detail: string;
}) {
  return (
    <main className="app-canvas min-h-[calc(100dvh-4rem)] px-4 py-8 lg:px-8">
      <section className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-950 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-600 text-lg font-black text-white">!</span>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold">Không mở được bài luyện nghe</h1>
            <p className="mt-2 text-sm font-semibold">{reason}</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-rose-200 bg-white/70 p-4 text-sm">
          <p><strong>Thông tin yêu cầu:</strong> {partId} (part {partNum}), level {level}</p>
          <p className="mt-2 break-words font-mono text-xs text-rose-800"><strong>Chi tiết:</strong> {detail}</p>
        </div>
        <p className="mt-4 text-xs text-rose-800">Bạn có thể chụp màn hình phần “Chi tiết” này để kiểm tra cấu hình API hoặc dữ liệu đồng bộ.</p>
        <a href={`/listen?part=${partId}`} className="mt-5 inline-flex rounded-xl bg-rose-700 px-4 py-2 text-sm font-extrabold text-white no-underline hover:bg-rose-800">← Quay lại danh sách level</a>
      </section>
    </main>
  );
}
