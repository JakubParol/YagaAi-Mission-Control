import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "http://127.0.0.1:5000";
const NEXT_DIST_DIR = process.env.NEXT_DIST_DIR || ".next";

const nextConfig: NextConfig = {
  distDir: NEXT_DIST_DIR,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
