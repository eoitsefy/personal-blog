import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/security/content-security-policy";

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = buildContentSecurityPolicy(isDevelopment);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      ...["h3-v2", "h3-v3", "h3-v4", "h3-mobile-v1", "h3-mobile-v2", "h3-cheer-rmbg2-v1", "h3-cheer-rmbg2-mobile-v1", "h3-basics-rmbg2-v1", "h3-basics-rmbg2-mobile-v1"].map(version => ({
        source: `/assistant/${version}/:path*`,
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
