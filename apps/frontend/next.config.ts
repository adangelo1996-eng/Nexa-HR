import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=()"
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-site" }
    ];
    if (isProd) {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload"
      });
    }
    return [
      {
        source: "/:path*",
        headers: base
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
