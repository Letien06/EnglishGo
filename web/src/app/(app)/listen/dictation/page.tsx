import { getCurrentUserForRead } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";
import DictationLibraryClient from "./DictationLibraryClient";

export const dynamic = "force-dynamic";

export default async function DictationLibraryPage() {
  const user = await getCurrentUserForRead();
  const [lessons, progress] = await Promise.all([
    dictation.listPublishedLessons(),
    user ? dictation.listUserLessonProgress(user.uid) : Promise.resolve([]),
  ]);
  return <DictationLibraryClient lessons={lessons} progress={progress} />;
}
