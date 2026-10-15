"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readStudyStreakCache, STUDY_STREAK_UPDATED_EVENT } from "@/lib/client-study-streak-cache";

type MilestoneResponse = {
  success: boolean;
  data: number | null;
};

const AUTO_DISMISS_SECONDS = 10;
let checkedThisSession = false;

export default function StudyStreakCelebration() {
  const [milestone, setMilestone] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(AUTO_DISMISS_SECONDS);
  const [reduceMotion, setReduceMotion] = useState(false);
  const checking = useRef(false);
  const lastQualified = useRef("");

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const checkForMilestone = useCallback(async () => {
    if (checking.current || milestone != null) return;
    checking.current = true;
    try {
      const response = await fetch("/api/study/streak", {
        method: "POST",
        cache: "no-store",
      });
      const result = (await response.json()) as MilestoneResponse;
      if (response.ok && result.success && typeof result.data === "number") {
        setSecondsRemaining(AUTO_DISMISS_SECONDS);
        setMilestone(result.data);
      }
    } catch {
      // Celebration is optional; normal study flows should never be blocked by it.
    } finally {
      checking.current = false;
    }
  }, [milestone]);

  useEffect(() => {
    const onStreak = (event: Event) => {
      const uid = (event as CustomEvent<{ uid?: string }>).detail?.uid;
      const data = uid ? readStudyStreakCache(uid)?.data : null;
      if (!data?.studiedToday) return;
      const key = `${uid}:${data.todayDateKey}:${data.streakDays}`;
      if (lastQualified.current === key) return;
      lastQualified.current = key;
      void checkForMilestone();
    };
    window.addEventListener(STUDY_STREAK_UPDATED_EVENT, onStreak);
    return () => window.removeEventListener(STUDY_STREAK_UPDATED_EVENT, onStreak);
  }, [checkForMilestone]);

  useEffect(() => {
    if (checkedThisSession) return;
    checkedThisSession = true;
    const timer = window.setTimeout(() => void checkForMilestone(), 1_200);
    return () => window.clearTimeout(timer);
  }, [checkForMilestone]);

  useEffect(() => {
    if (milestone == null) return;

    const dismissTimer = window.setTimeout(
      () => setMilestone(null),
      AUTO_DISMISS_SECONDS * 1000,
    );
    const countdownTimer = window.setInterval(() => {
      setSecondsRemaining((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => {
      window.clearTimeout(dismissTimer);
      window.clearInterval(countdownTimer);
    };
  }, [milestone]);

  if (milestone == null) return null;

  return (
    <section className="streak-celebration" aria-labelledby="streak-celebration-title">
      <p className="sr-only" role="status">Bạn đã đạt chuỗi học {milestone} ngày.</p>
      <span className="streak-spark streak-spark-one" aria-hidden="true">✦</span>
      <span className="streak-spark streak-spark-two" aria-hidden="true">✦</span>
      <button
        type="button"
        className="streak-celebration-close"
        onClick={() => setMilestone(null)}
        aria-label="Đóng thông báo chuỗi học"
      >
        ×
      </button>
      <div className="streak-celebration-flame" aria-hidden="true">🔥</div>
      <p className="streak-celebration-eyebrow">Mốc chuỗi mới</p>
      <h2 id="streak-celebration-title" className="streak-celebration-title">Bạn đang học rất đều!</h2>
      <p className="streak-celebration-copy">Bạn đã duy trì liên tiếp</p>
      <p className="streak-celebration-number">
        <AnimatedDayCount value={milestone} reduceMotion={reduceMotion} /> <span>ngày</span>
      </p>
      <p className="streak-celebration-countdown" aria-hidden="true">Tự ẩn sau {secondsRemaining} giây</p>
      <button type="button" className="streak-celebration-confirm" onClick={() => setMilestone(null)}>
        Đã rõ
      </button>
    </section>
  );
}

function AnimatedDayCount({ value, reduceMotion }: { value: number; reduceMotion: boolean }) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;

    let frame = 0;
    const startedAt = performance.now();
    const duration = 720;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, value]);

  return <strong key={value}>{reduceMotion ? value : displayed}</strong>;
}
