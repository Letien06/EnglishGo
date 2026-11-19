import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.dautoiec.tech";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "", priority: 1.0, changeFrequency: "daily" },
    { path: "/listen", priority: 0.9, changeFrequency: "daily" },
    { path: "/listen/dictation", priority: 0.8, changeFrequency: "weekly" },
    { path: "/read", priority: 0.9, changeFrequency: "daily" },
    { path: "/read/grammar", priority: 0.85, changeFrequency: "weekly" },
    { path: "/vocab", priority: 0.9, changeFrequency: "daily" },
    { path: "/writing", priority: 0.85, changeFrequency: "weekly" },
    { path: "/practice", priority: 0.9, changeFrequency: "daily" },
    { path: "/leaderboard", priority: 0.7, changeFrequency: "daily" },
    { path: "/login", priority: 0.5, changeFrequency: "monthly" },
  ];

  return routes.map((entry) => ({
    url: `${SITE_URL}${entry.path}`,
    lastModified: now,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
