import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone은 배포 시에만: NODE_ENV=production npm run build
  ...(process.env.NODE_ENV === "production" && { output: "standalone" }),
};

export default nextConfig;
