import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { template: "%s | CNC ERP", default: "현장 페이지 | CNC ERP" },
  description: "현장 페이지",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
