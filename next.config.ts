import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Box art + screenshots come from external hosts (IGDB, etc.).
    remotePatterns: [
      { protocol: "https", hostname: "images.igdb.com" },
      { protocol: "https", hostname: "**" }, // PoC-permissive; tighten before public launch
    ],
  },
};

export default nextConfig;
