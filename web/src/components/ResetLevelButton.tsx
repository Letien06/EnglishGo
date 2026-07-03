"use client";

interface Props {
  part: number;
  level: number;
  endpoint: string;
}

export default function ResetLevelButton({ part, level, endpoint }: Props) {
  const handleClick = async () => {
    if (!confirm("Reset tiến độ level này?")) return;
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part, level }),
      });
      window.location.reload();
    } catch {
      // Keep this quiet; the next reload/retry will show current progress.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-xs font-extrabold text-muted transition-colors hover:border-red-300 hover:text-red-500"
      title="Reset tiến độ"
    >
      Reset
    </button>
  );
}
