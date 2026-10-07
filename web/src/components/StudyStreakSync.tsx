"use client";

import { useEffect } from "react";
import { publishStudyStreak, type StudyStreakSnapshot } from "@/lib/client-study-streak-cache";

/** Reuse the current learner's server-rendered summary in the header. */
export default function StudyStreakSync({ uid, summary }: {
  uid: string;
  summary: Omit<StudyStreakSnapshot, "authenticated">;
}) {
  useEffect(() => {
    publishStudyStreak(uid, { ...summary, authenticated: true });
  }, [uid, summary]);
  return null;
}
