"use client";

import { useEffect, useState } from "react";
import Link from "@/components/IntentLink";
import NavIcon from "@/components/NavIcon";
import ResetLevelButton from "@/components/ResetLevelButton";
import { useAuthenticatedSession } from "@/components/AuthenticatedSessionContext";
import { ACTIVE_LEARNER_UPDATED_EVENT, LEARNING_LEVELS_UPDATED_EVENT, activeLearnerId, invalidateLearningLevels, isLearningLevelsDirty } from "@/lib/client-learning-progress-cache";
import type { DauToeicPartTest } from "@/types/dautoeic";

const progressCache = new Map<string, DauToeicPartTest[]>();

export default function TestDashboardClient({ skill, part, initialTests, initialError }: {
  skill: "listening" | "reading";
  part: number;
  initialTests: DauToeicPartTest[];
  initialError: boolean;
}) {
  const authenticated = useAuthenticatedSession();
  const [view, setView] = useState<{ uid: string | null; tests: DauToeicPartTest[] }>({ uid: null, tests: initialTests });
  const [progressError, setProgressError] = useState(false);
  const base = skill === "listening" ? "/listen" : "/read";

  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    const refresh = async () => {
      if (disposed) return;
      controller?.abort();
      const uid = authenticated ? activeLearnerId() : null;
      const key = `${skill}:${part}:${uid}`;
      if (isLearningLevelsDirty(skill, part, uid)) progressCache.delete(key);
      setView({ uid, tests: uid ? progressCache.get(key) ?? initialTests : initialTests });
      setProgressError(false);
      if (!uid) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(`/api/${skill}/tests?part=${part}`, { cache: "no-store", signal: request.signal });
        const payload = await response.json();
        if (disposed || request.signal.aborted || activeLearnerId() !== uid) return;
        if (!response.ok || !payload.success || payload.data?.uid !== uid || !Array.isArray(payload.data.tests)) throw new Error("Progress unavailable");
        if (progressCache.size >= 32) progressCache.delete(progressCache.keys().next().value!);
        progressCache.set(key, payload.data.tests);
        setView({ uid, tests: payload.data.tests });
      } catch {
        if (!disposed && !request.signal.aborted && activeLearnerId() === uid) setProgressError(true);
      }
    };
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ skill?: string; parts?: number[] }>).detail;
      if (detail?.skill === skill && detail.parts?.includes(part)) {
        progressCache.delete(`${skill}:${part}:${activeLearnerId()}`);
        void refresh();
      }
    };
    const onIdentity = () => { progressCache.clear(); void refresh(); };
    void Promise.resolve().then(refresh);
    window.addEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onIdentity);
    window.addEventListener(LEARNING_LEVELS_UPDATED_EVENT, onProgress);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onIdentity);
      window.removeEventListener(LEARNING_LEVELS_UPDATED_EVENT, onProgress);
    };
  }, [authenticated, initialTests, part, skill]);

  if (initialError) return <section className="premium-card p-6" role="alert"><h3>Chưa tải được danh sách test.</h3><p className="mt-2 text-sm text-muted">Vui lòng tải lại trang để thử lại.</p></section>;
  const tests = authenticated && view.uid === activeLearnerId() ? view.tests : initialTests;
  if (!tests.length) return <p className="study-caption">Chưa có test cho Part này.</p>;
  const groups = [...new Set(tests.map((test) => test.setName))];

  return <>
    {progressError && <p role="status" className="study-caption">Chưa cập nhật được tiến độ. Bạn vẫn có thể mở bài.</p>}
    {groups.map((setName) => <section className="study-test-set" key={setName} aria-label={setName}>
      <div className="study-test-set-heading"><h3>{setName}</h3><span>{tests.filter((test) => test.setName === setName).length} test</span></div>
      <div className="study-level-grid study-test-grid">
        {tests.filter((test) => test.setName === setName).map((test, index) => {
          const percent = test.questionCount ? Math.min(100, Math.round(test.done / test.questionCount * 100)) : 0;
          const href = `${base}/practice?part=part${part}&testId=${encodeURIComponent(test.testId)}&mode=normal&q=${test.nextIndex}`;
          return <article className="study-level-card" key={test.testId}>
            <header><span className="study-level-number">{String(index + 1).padStart(2, "0")}</span><div><h4>{test.testName}</h4><p>Part {part} · {test.questionCount} câu hỏi</p></div></header>
            <div className="study-level-progress"><div><span>{test.done}/{test.questionCount} đã học</span><strong>{percent}%</strong></div><progress max={100} value={percent} aria-label={`Tiến độ ${test.testName} - ${setName}`} /></div>
            <div className="study-level-stats"><span><strong>{test.correct}</strong> đúng</span><span><strong>{test.wrong}</strong> sai</span><span><strong>{Math.max(0, test.questionCount - test.done)}</strong> còn lại</span></div>
            <footer>
              {test.done > 0 && <ResetLevelButton part={part} level={1} testId={test.testId} testName={`${test.testName} - ${setName}`} endpoint={`/api/${skill}/reset`} onReset={() => invalidateLearningLevels(skill, [part])} />}
              {test.questionCount > 0 ? <Link className="study-start-link" href={href} aria-label={`${test.done > 0 ? "Học tiếp" : "Bắt đầu"} ${test.testName} - ${setName}`}>{percent === 100 ? "Ôn lại" : test.done > 0 ? "Học tiếp" : "Bắt đầu"}<NavIcon name="arrow-right" /></Link> : <span className="study-unavailable">Chưa có câu hỏi</span>}
            </footer>
          </article>;
        })}
      </div>
    </section>)}
  </>;
}
