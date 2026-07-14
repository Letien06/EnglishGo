export default function Loading() {
  return (
    <main className="app-canvas flex min-h-dvh items-center justify-center px-5">
      <div className="app-busy-card" role="status" aria-live="polite">
        <span className="app-busy-spinner" />
        <div>
          <p className="app-busy-title">Đang chuẩn bị bài học</p>
          <p className="app-busy-description">Chỉ mất một chút thời gian.</p>
        </div>
      </div>
    </main>
  );
}
