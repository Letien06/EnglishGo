import type { Metadata } from "next";
import { Suspense } from "react";
import { Be_Vietnam_Pro, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AppOverdelay from "@/components/AppOverdelay";
import PwaServiceWorker from "@/components/PwaServiceWorker";
import PerformanceTelemetry from "@/components/PerformanceTelemetry";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.dautoiec.tech";
const SITE_TITLE = "ENGLISHGO - Luyện TOEIC miễn phí";
const SITE_DESCRIPTION =
  "Nền tảng luyện thi TOEIC toàn diện: luyện nghe, đọc hiểu, viết, ngữ pháp, từ vựng và đề thi thử.";
const ENABLE_VERCEL_ANALYTICS = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: "variable",
  display: "swap",
  variable: "--font-plus-jakarta",
});

// Load only the 3 essential weights (400/600/700) to reduce initial .woff2 downloads.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-be-vietnam",
});

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
      t = "dark";
    }
    document.documentElement.dataset.theme = t;
  } catch(e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-theme="dark" suppressHydrationWarning className={`${plusJakartaSans.variable} ${beVietnamPro.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <Suspense fallback={null}>
          <AppOverdelay />
        </Suspense>
        <PwaServiceWorker />
        <PerformanceTelemetry />
        {children}
        {ENABLE_VERCEL_ANALYTICS && <Analytics />}
        <SpeedInsights />
      </body>
    </html>
  );
}
