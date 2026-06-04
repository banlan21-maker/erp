/**
 * 클라이언트 측 이미지 압축 — 브라우저 canvas 사용 (서버 부담 0)
 *
 * 사용: const compressedBlob = await compressImage(file, { maxSide: 1600, quality: 0.8 });
 *
 * 동작:
 *  1. File → HTMLImageElement 로 디코드
 *  2. 긴 변이 maxSide 초과하면 비례 축소
 *  3. canvas 에 그리고 JPEG 로 인코딩 (지정 quality)
 *  4. Blob 반환 (multipart 업로드에 바로 사용 가능)
 *
 * 결과 크기: 일반 카메라 사진(3~10MB) → 약 100~400KB
 */

export interface CompressOptions {
  maxSide?:  number;  // 긴 변의 최대 픽셀 (기본 1600)
  quality?:  number;  // JPEG 품질 0~1 (기본 0.8)
  mimeType?: string;  // 출력 mime (기본 image/jpeg)
}

export async function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<Blob> {
  const { maxSide = 1600, quality = 0.8, mimeType = "image/jpeg" } = opts;

  // 1. 파일 → 이미지 디코드
  const img = await loadImage(file);

  // 2. 축소 비율 계산
  const { width: ow, height: oh } = img;
  const longSide = Math.max(ow, oh);
  const scale    = longSide > maxSide ? maxSide / longSide : 1;
  const w = Math.round(ow * scale);
  const h = Math.round(oh * scale);

  // 3. canvas 에 그리기
  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context 생성 실패");
  ctx.drawImage(img, 0, 0, w, h);

  // 4. Blob 으로 인코딩
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob 실패"));
      },
      mimeType,
      quality,
    );
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** 압축된 Blob → File 로 감싸기 (multipart 전송시 유용) */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/** 사람이 읽기 좋은 크기 표시 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
