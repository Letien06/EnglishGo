"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import StudyLoading from "../../_components/StudyLoading";

function ReadingPracticeLoading() {
  const params = useSearchParams();
  const part = params.get("part");
  return <StudyLoading practice readingPart={part === "part6" ? 6 : part === "part7" ? 7 : 5} />;
}

export default function Loading() {
  return <Suspense fallback={<StudyLoading practice readingPart={5} />}><ReadingPracticeLoading /></Suspense>;
}
