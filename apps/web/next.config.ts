import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "http://127.0.0.1:5000";
const NEXT_DIST_DIR = process.env.NEXT_DIST_DIR || ".next";

const DEFAULT_ALLOWED_DEV_ORIGINS = ["localhost", "127.0.0.1", "100.106.117.41"];
const allowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS
  ? process.env.NEXT_ALLOWED_DEV_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : DEFAULT_ALLOWED_DEV_ORIGINS;

const nextConfig: NextConfig = {
  distDir: NEXT_DIST_DIR,
  allowedDevOrigins,
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
