import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const domainDistIndex = path.resolve(__dirname, "../../packages/domain/dist/index.js");
const domainDistExists = fs.existsSync(domainDistIndex);
// #region agent log
void fetch("http://127.0.0.1:7671/ingest/04747ddd-3563-481e-aa3a-8135cb5f9a9b", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "fb5f3b" },
  body: JSON.stringify({
    sessionId: "fb5f3b",
    runId: "post-fix-verify",
    hypothesisId: "H1",
    location: "next.config.ts:preload",
    message: "next config: @payday/domain dist presence",
    data: { domainDistExists, domainDistIndex },
    timestamp: Date.now()
  })
}).catch(() => {});
// #endregion

const nextConfig: NextConfig = {
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self)"
          }
        ]
      }
    ];
  },
  async redirects() {
    return [
      { source: "/payroll-calc", destination: "/payroll-hebb", permanent: true },
      { source: "/payroll-batch", destination: "/payroll-hebb", permanent: true }
    ];
  }
};

export default nextConfig;
