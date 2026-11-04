import type { MetadataRoute } from "next";
import { brand } from "@platform/shared";

export default function manifest(): MetadataRoute.Manifest {
  return { name: brand.name, short_name: "SinverseGames", description: brand.description, start_url: "/games", display: "standalone", background_color: "#0b0a18", theme_color: "#0b0a18", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
