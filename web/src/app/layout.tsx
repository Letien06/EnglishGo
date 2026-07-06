import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AppOverdelay from "@/components/AppOverdelay";
import "./globals.css";

const SITE_URL = "https://www.englishgo.io.vn";
const SITE_TITLE = "ENGLISHGO - Luyện TOEIC miễn phí";
const SITE_DESCRIPTION =
  "Nền tảng luyện thi TOEIC toàn diện: luyện nghe, ngữ pháp, từ vựng, đề thi thử và đọc hiểu.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "ENGLISHGO",
  openGraph: {
    type: "website",
    siteName: "ENGLISHGO",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: "vi_VN",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem("englishgo-theme");
    var manual = localStorage.getItem("englishgo-theme-manual") === "1";
    if (!manual || (t !== "dark" && t !== "light")) {
      t = "light";
    }
    document.documentElement.dataset.theme = t;
  } catch(e) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <Suspense fallback={null}>
          <AppOverdelay />
        </Suspense>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
