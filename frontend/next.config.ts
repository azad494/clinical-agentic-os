import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, context) => {
    // Force Webpack to actively check for file changes in Docker
    config.watchOptions = {
      poll: 1000, // Check every 1 second
      aggregateTimeout: 300, // Wait 300ms after a change before rebuilding
    };
    return config;
  },
};

export default nextConfig;