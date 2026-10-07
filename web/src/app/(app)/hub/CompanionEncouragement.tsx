"use client";

import { useEffect, useState } from "react";
import { DashboardIcon } from "./DashboardArt";
import styles from "./dashboard.module.css";

const messages = [
  "Cùng học thêm một chút hôm nay nhé!",
  "Mỗi từ mới hôm nay là một bước gần hơn đến mục tiêu của bạn.",
  "Không cần hoàn hảo, chỉ cần tiến bộ thêm một chút mỗi ngày.",
  "Sai một câu cũng là cơ hội để lần sau nhớ lâu hơn!",
  "Học chậm cũng được. Quan trọng là bạn vẫn tiếp tục cố gắng.",
  "Một bài nghe, vài từ mới — hôm nay như vậy cũng rất đáng tự hào!",
  "Mệt thì nghỉ một chút nhé. Khi sẵn sàng, mình cùng học tiếp.",
  "Bạn đang xây dựng thói quen tốt. Cứ từng bước, rồi sẽ đến đích!",
] as const;

export default function CompanionEncouragement() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      setIndex(previous => (previous + 1) % messages.length);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [index]);

  return <aside className={styles.speech} aria-label="Lời động viên">
    <p className={styles.encouragementQuote}>{messages[index]}</p>
    <div className={styles.encouragementFooter}>
      <span>Mình luôn ở đây cổ vũ bạn.</span>
      <button type="button" onClick={() => setIndex(previous => (previous + 1) % messages.length)} aria-label="Lời động viên tiếp theo" title="Thêm một lời động viên"><DashboardIcon name="arrow" /></button>
    </div>
  </aside>;
}
