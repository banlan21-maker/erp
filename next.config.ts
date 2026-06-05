import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone은 배포 시에만: NODE_ENV=production npm run build
  ...(process.env.NODE_ENV === "production" && {
    output: "standalone",
    // pdfjs worker 파일이 standalone 빌드에 포함되도록 명시
    outputFileTracingIncludes: {
      "/api/cutting-drawings/**": [
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
        "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      ],
    },
  }),
};

export default nextConfig;
