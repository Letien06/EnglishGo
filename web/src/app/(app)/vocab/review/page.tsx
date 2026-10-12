import { redirect } from "next/navigation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { getReviewSession } from "@/lib/services/vocab";
import ReviewTodayClient from "./ReviewTodayClient";
import MistakeReviewList from "./MistakeReviewList";
import { Suspense } from "react";

export default async function ReviewTodayPage() {
  const user = await getCurrentUserForRead();
  if (!user) redirect("/login?redirect=%2Fvocab%2Freview");
  const session = await getReviewSession(user.uid, 50);
  return <><ReviewTodayClient uid={user.uid} words={session.words} /><Suspense fallback={<div className="mx-auto h-40 max-w-5xl animate-pulse rounded-xl bg-surface-soft" aria-label="Đang tải câu cần ôn" />}><MistakeReviewList uid={user.uid} /></Suspense></>;
}
