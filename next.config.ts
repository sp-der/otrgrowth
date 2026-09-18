import type { NextConfig } from "next";

const studioHost = (
  process.env.HYPERFRAMES_STUDIO_URL ||
  process.env.NEXT_PUBLIC_HYPERFRAMES_STUDIO_URL ||
  "https://hyperframes-host-production.up.railway.app"
).trim().replace(/\/+$/, "");

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    if (!studioHost) return [];
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        { source: "/hyperframes-studio", destination: `${studioHost}/` },
        {
          source: "/hyperframes-studio/:path*",
          destination: `${studioHost}/:path*`,
        },
        { source: "/assets/:path*", destination: `${studioHost}/assets/:path*` },
        { source: "/api/:path*", destination: `${studioHost}/api/:path*` },
      ],
    };
  },
};
export default config;
