import type { MetadataRoute } from "next";
import { brand } from "@platform/shared";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/room/", "/play/", "/profile"] }],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
  };
}
