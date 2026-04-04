import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  async redirects() {
    return [
      { source: "/payroll-calc", destination: "/payroll-hebb", permanent: true },
      { source: "/payroll-batch", destination: "/payroll-hebb", permanent: true }
    ];
  }
};

export default nextConfig;
