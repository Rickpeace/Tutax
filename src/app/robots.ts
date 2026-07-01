import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/url";

// Öffentliche Hilfe-Seiten (/h, Landing, Rechtstexte) dürfen indexiert werden.
// Alles hinter Login / interne Flächen werden ausgeschlossen.
export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app",
        "/admin",
        "/api",
        "/onboarding",
        "/invite",
        "/auth",
        "/reset",
        "/login",
        "/signup",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
