import { redirect } from "next/navigation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { getReviewSession } from "@/lib/services/vocab";
import ReviewTodayClient from "./ReviewTodayClient";

export default async function ReviewTodayPage() {
  const user = await getCurrentUserForRead();
  if (!user) redirect("/login?redirect=%2Fvocab%2Freview");
  const session = await getReviewSession(user.uid, 50);
  return <ReviewTodayClient uid={user.uid} words={session.words} />;
}
