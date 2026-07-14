import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENGLISHGO - Luyện TOEIC",
    short_name: "ENGLISHGO",
    description: "Nền tảng luyện TOEIC cá nhân hóa.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fc",
    theme_color: "#d79a2b",
    lang: "vi",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
