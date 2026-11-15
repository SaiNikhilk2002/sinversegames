import type { MetadataRoute } from "next";
import { brand, GAMES, visibleCategories } from "@platform/shared";

export default function sitemap(): MetadataRoute.Sitemap {
  const u = (path: string) => `${brand.siteUrl}${path}`;
  return [
    { url: u("/"), changeFrequency: "weekly", priority: 1 },
    { url: u("/games"), changeFrequency: "weekly", priority: 0.9 },
    // Category landing pages with games (Couples has its own page at /couples).
    ...visibleCategories().map((c) => ({ url: u(c.href ?? `/categories/${c.slug}`), changeFrequency: "weekly" as const, priority: c.id === "couples" ? 0.85 : 0.7 })),
    ...GAMES.map((g) => ({ url: u(`/games/${g.slug}`), lastModified: new Date(g.addedAt), changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: u("/leaderboard"), changeFrequency: "daily", priority: 0.5 },
    ...["/about", "/contact", "/privacy", "/terms", "/cookies"].map((p) => ({ url: u(p), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
