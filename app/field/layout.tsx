import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "현장 작업일보 | CNC ERP",
  description: "현장 작업일보 입력",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
