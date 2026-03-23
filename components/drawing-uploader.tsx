"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function DrawingUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setResult({ success: false, message: "Excel 파일(.xlsx, .xls)만 업로드 가능합니다." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);

      const res = await fetch("/api/drawings", { method: "POST", body: formData });
      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: `${data.data.count}행 업로드 완료${data.data.warnings?.length ? ` (경고 ${data.data.warnings.length}건)` : ""}`,
        });
        router.refresh();
      } else {
        setResult({
          success: false,
          message: data.error + (data.details?.length ? `\n${data.details.slice(0, 3).join("\n")}` : ""),
        });
      }
    } catch {
      setResult({ success: false, message: "업로드 중 오류가 발생했습니다." });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      {result && (
        <p className={`text-xs whitespace-pre-line ${result.success ? "text-green-600" : "text-red-500"}`}>
          {result.message}
        </p>
      )}
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2"
      >
        <Upload size={14} />
        {loading ? "파싱 중..." : "Excel 업로드"}
      </Button>
    </div>
  );
}
