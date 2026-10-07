import { getCurrentUserForRead } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";
import DictationLibraryClient from "./DictationLibraryClient";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DictationLibraryPage() {
  const user = await getCurrentUserForRead();
  const [lessons, progress] = await Promise.all([
    dictation.listPublishedLessons(),
    user ? dictation.listUserLessonProgress(user.uid) : Promise.resolve([]),
  ]);
  return <><div className="mx-auto max-w-6xl px-4 pt-5"><Link href="/listen/audio-dictation" className="inline-flex rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-primary no-underline">Nghe chép TOEIC theo câu →</Link></div><DictationLibraryClient lessons={lessons} progress={progress} /></>;
}
