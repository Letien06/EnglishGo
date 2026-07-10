"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type MilestoneResponse = {
  success: boolean;
  data: number | null;
};

const CHECK_INTERVAL_MS = 30_000;
const AUTO_DISMISS_SECONDS = 10;

export default function StudyStreakCelebration() {
  const pathname = usePathname();
  const [milestone, setMilestone] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(AUTO_DISMISS_SECONDS);
  const checking = useRef(false);

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
    const timer = window.setTimeout(() => void checkForMilestone(), 500);
    return () => window.clearTimeout(timer);
  }, [pathname, checkForMilestone]);

  useEffect(() => {
    const interval = window.setInterval(() => void checkForMilestone(), CHECK_INTERVAL_MS);
    const onFocus = () => void checkForMilestone();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
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
    <section className="streak-celebration" role="status" aria-live="assertive" aria-label={`Bạn đã đạt chuỗi học ${milestone} ngày`}>
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
      <h2 className="streak-celebration-title">Bạn đang học rất đều!</h2>
      <p className="streak-celebration-copy">Bạn đã duy trì liên tiếp</p>
      <p className="streak-celebration-number">
        <AnimatedDayCount value={milestone} /> <span>ngày</span>
      </p>
      <p className="streak-celebration-countdown">Tự ẩn sau {secondsRemaining} giây</p>
      <button type="button" className="streak-celebration-confirm" onClick={() => setMilestone(null)}>
        Đã rõ
      </button>
    </section>
  );
}

function AnimatedDayCount({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
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
  }, [value]);

  return <strong key={value}>{displayed}</strong>;
}
