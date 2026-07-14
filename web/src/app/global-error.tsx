"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", fontFamily: "system-ui, sans-serif", background: "#f7f8fc", color: "#14213d" }}>
          <section style={{ maxWidth: "560px", padding: "32px", textAlign: "center", borderRadius: "20px", background: "white", boxShadow: "0 18px 50px rgba(20, 33, 61, 0.12)" }} role="alert">
            <p style={{ fontWeight: 800, letterSpacing: "0.12em", color: "#b7791f" }}>ENGLISHGO</p>
            <h1>Trang này đang cần một lần thử lại</h1>
            <p>Tiến trình của bạn vẫn được lưu trên thiết bị. Hãy tải lại để tiếp tục học.</p>
            <button type="button" onClick={reset} style={{ marginTop: "16px", border: 0, borderRadius: "12px", padding: "12px 18px", fontWeight: 800, cursor: "pointer", background: "#d79a2b", color: "#14213d" }}>
              Thử lại
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
