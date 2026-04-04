import type { NextConfig } from "next";

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
            value: "camera=(), microphone=(), geolocation=(self)"
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
