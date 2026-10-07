"use client";

import { useEffect, useState } from "react";
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
    let timer: number | undefined;
    const restart = () => {
      window.clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "hidden") {
        timer = window.setInterval(() => setIndex(previous => (previous + 1) % messages.length), 5_000);
      }
    };
    restart();
    document.addEventListener("visibilitychange", restart);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", restart);
    };
  }, []);

  return <aside className={styles.speech} aria-label="Lời động viên">
    <div className={styles.encouragementQuote}>
      {messages.map((message, messageIndex) => <p key={message} aria-hidden={messageIndex !== index} className={messageIndex !== index ? styles.encouragementSizer : undefined}>{message}</p>)}
    </div>
    <div className={styles.encouragementFooter}>
      <span>Mình luôn ở đây cổ vũ bạn.</span>
    </div>
  </aside>;
}
