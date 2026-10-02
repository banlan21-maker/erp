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
      // 주간보고 엑셀 양식 원본 — 런타임에 fs 로 읽으므로 standalone 에 명시해 넣는다
      "/api/weekly-report/excel": ["./lib/report-templates/weekly-report.xlsx"],
    },
  }),
};

export default nextConfig;
