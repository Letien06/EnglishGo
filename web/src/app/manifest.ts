import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENGLISHGO - Luyện TOEIC",
    short_name: "ENGLISHGO",
    description: "Luyện nghe, đọc, từ vựng và đề thi TOEIC.",
    start_url: "/hub",
    display: "standalone",
    background_color: "#fffaf0",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
