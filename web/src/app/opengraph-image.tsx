import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ENGLISHGO - Luyện TOEIC miễn phí";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0b2447 0%, #19376d 45%, #1d5c9e 100%)",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "28px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "128px",
              height: "128px",
              borderRadius: "32px",
              background: "linear-gradient(135deg, #f6b73c 0%, #e0952b 100%)",
              color: "#3b1d00",
              fontSize: "84px",
              fontWeight: 800,
            }}
          >
            E
          </div>
          <div
            style={{
              color: "#ffffff",
              fontSize: "72px",
              fontWeight: 800,
              letterSpacing: "-2px",
            }}
          >
            ENGLISHGO
          </div>
        </div>
        <div
          style={{
            color: "#ffffff",
            fontSize: "60px",
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: "900px",
          }}
        >
          Luyện thi TOEIC toàn diện, miễn phí
        </div>
        <div
          style={{
            marginTop: "24px",
            color: "#cfe0f5",
            fontSize: "34px",
            fontWeight: 500,
            maxWidth: "900px",
          }}
        >
          Nghe · Đọc · Từ vựng · Ngữ pháp · Đề thi thử
        </div>
      </div>
    ),
    { ...size },
  );
}
