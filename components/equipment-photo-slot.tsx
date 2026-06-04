"use client";

/**
 * 장비 사진 슬롯 — 1개 슬롯 단위
 *
 * 두 가지 모드:
 *  - mode="immediate": equipmentId 있을 때, 선택 즉시 압축 + 업로드 + DB 반영
 *  - mode="pending":   equipmentId 없을 때(신규 등록), 압축된 Blob 만 부모에게 전달
 *
 * 압축: lib/image-compress.ts (max 1600px, JPEG 0.8 — 보통 100~400KB)
 */

import { useState, useRef } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { compressImage, blobToFile, formatBytes } from "@/lib/image-compress";

interface BaseProps {
  slot:        1 | 2;
  photoUrl:    string | null;
}

interface ImmediateProps extends BaseProps {
  mode:        "immediate";
  equipmentId: string;
  onChange:    (newUrl: string | null) => void;
}

interface PendingProps extends BaseProps {
  mode:        "pending";
  pendingFile: File | null;
  onPending:   (file: File | null) => void;
}

type Props = ImmediateProps | PendingProps;

export default function EquipmentPhotoSlot(props: Props) {
  const { slot, photoUrl } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      const blob = await compressImage(file, { maxSide: 1600, quality: 0.8 });
      const compressed = blobToFile(blob, `slot${slot}.jpg`);

      if (props.mode === "immediate") {
        // 즉시 업로드
        const fd = new FormData();
        fd.append("file", compressed);
        const res = await fetch(`/api/mgmt-equipment/${props.equipmentId}/photo?slot=${slot}`, {
          method: "POST",
          body:   fd,
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "업로드 실패");
        const newUrl = slot === 1 ? data.data.photoUrl1 : data.data.photoUrl2;
        props.onChange(newUrl);
      } else {
        // 펜딩: 부모에게 압축된 파일 전달 + 로컬 미리보기 url 생성
        props.onPending(compressed);
        if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        setPendingPreview(URL.createObjectURL(blob));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "이미지 처리 실패");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (props.mode === "immediate" && props.photoUrl) {
      if (!confirm(`사진 ${slot} 을 삭제하시겠습니까?`)) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/mgmt-equipment/${props.equipmentId}/photo?slot=${slot}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "삭제 실패");
        props.onChange(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "삭제 실패");
      } finally {
        setBusy(false);
      }
    } else if (props.mode === "pending") {
      props.onPending(null);
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingPreview(null);
    }
  };

  const previewUrl = photoUrl
    ?? (props.mode === "pending" && pendingPreview ? pendingPreview : null);
  const pendingFile = props.mode === "pending" ? props.pendingFile : null;

  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-gray-500">사진 {slot}</div>
      <div className="relative w-full aspect-[4/3] bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg overflow-hidden">
        {busy && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 text-gray-500 text-xs">
            <Loader2 size={18} className="animate-spin mr-1" /> 처리 중...
          </div>
        )}
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={`장비 사진 ${slot}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="absolute top-1.5 right-1.5 z-10 p-1 bg-black/60 text-white rounded-full hover:bg-black/80 disabled:opacity-50"
              title="삭제"
            >
              <X size={14} />
            </button>
            {pendingFile && (
              <div className="absolute bottom-1 left-1 z-10 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded font-mono">
                대기 · {formatBytes(pendingFile.size)}
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50/30 transition-colors disabled:opacity-50"
          >
            <ImagePlus size={28} />
            <span className="text-xs font-semibold">사진 등록</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPickFile}
          className="hidden"
        />
      </div>
      {error && <div className="text-[11px] text-red-600">{error}</div>}
    </div>
  );
}

