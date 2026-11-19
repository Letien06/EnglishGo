import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENGLISHGO - Luyện TOEIC",
    short_name: "ENGLISHGO",
    description: "Luyện nghe, đọc, viết, từ vựng và đề thi TOEIC.",
    start_url: "/hub",
    display: "standalone",
    background_color: "#111923",
    theme_color: "#111923",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
