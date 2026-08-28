import { notFound } from "next/navigation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as dictation from "@/lib/services/dictation";
import DictationLessonClient from "./DictationLessonClient";

export const dynamic = "force-dynamic";

export default async function DictationLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  let lesson: Awaited<ReturnType<typeof dictation.getPublishedLessonView>>;
  let user: Awaited<ReturnType<typeof getCurrentUserForRead>>;
  try {
    [lesson, user] = await Promise.all([dictation.getPublishedLessonView(lessonId), getCurrentUserForRead()]);
  } catch {
    notFound();
  }
  const progress = user ? await dictation.getUserLessonProgress(user.uid, lessonId) : null;
  return <DictationLessonClient lesson={lesson} initialProgress={progress} isAuthenticated={Boolean(user)} />;
}
