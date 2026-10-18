import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the PDF worker and native parser dependencies resolvable by Node.
  serverExternalPackages: ["pdf-parse", "mammoth", "formidable", "yauzl"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  reactStrictMode: true,
};

export default nextConfig;
