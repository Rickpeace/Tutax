import type { NextConfig } from "next";

// Eingeloggte/sensible Bereiche dürfen NICHT in fremde Seiten eingebettet werden
// (Clickjacking). Die öffentliche Hilfe-Seite /h/... bleibt bewusst einbettbar
// (iFrame-Embed ist ein Produkt-Feature, siehe Einstellungen → Einbetten).
const FRAME_PROTECTED = [
  "/app/:path*",
  "/admin/:path*",
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/onboarding",
  "/invite/:path*",
  "/auth/:path*",
];

const nextConfig: NextConfig = {
  // Cache Components / PPR: statische Shells + gecachte Daten (/h) + Suspense-Streams.
  // Daten-Caching der öffentlichen Seiten via 'use cache' + cacheTag/updateTag.
  cacheComponents: true,

  async headers() {
    return [
      {
        // Basis-Härtung für alles (auch /h – diese Header stören das Embedding nicht).
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
        ],
      },
      ...FRAME_PROTECTED.map((source) => ({
        source,
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      })),
    ];
  },
};

export default nextConfig;
