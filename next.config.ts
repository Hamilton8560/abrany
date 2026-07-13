import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server for a small Docker image / single always-on instance
  output: "standalone",
};

export default nextConfig;
