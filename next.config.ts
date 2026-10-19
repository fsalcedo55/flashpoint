import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the PDF worker and native parser dependencies resolvable by Node.
  serverExternalPackages: ["pdf-parse", "mammoth", "formidable", "yauzl"],
  outputFileTracingIncludes: {
    // PDF.js loads its worker and native canvas bindings dynamically, outside
    // Next.js's dependency tracing. Include them in the upload function.
    "/api/documents/upload": [
      "./node_modules/.pnpm/@napi-rs+canvas*/**/*",
      "./node_modules/.pnpm/pdfjs-dist@*/node_modules/@napi-rs/canvas/**/*",
      "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
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
