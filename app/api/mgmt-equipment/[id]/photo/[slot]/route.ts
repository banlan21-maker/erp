/**
 * 장비 사진 GET — 디스크에서 직접 읽어 응답
 *
 * standalone 모드의 정적 파일 서빙(public/uploads) 동작 차이를 우회.
 * 어떤 환경(개발/Docker/standalone)에서도 일관되게 작동.
 *
 * 경로: GET /api/mgmt-equipment/[id]/photo/[slot]   ([slot] = 1 또는 2)
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const EXTS_AND_TYPES: [string, string][] = [
  ["jpg",  "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png",  "image/png"],
  ["webp", "image/webp"],
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; slot: string }> }
) {
  const { id, slot } = await params;
  if (slot !== "1" && slot !== "2") {
    return NextResponse.json({ error: "slot must be 1 or 2" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "public", "uploads", "equipment", id);

  for (const [ext, mime] of EXTS_AND_TYPES) {
    const filepath = path.join(dir, `${slot}.${ext}`);
    try {
      await stat(filepath); // 존재 확인
      const buf = await readFile(filepath);
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type":  mime,
          // 캐시버스터(?t=...)로 갱신 보장하니까 1시간 캐싱 OK
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      // 다음 확장자 시도
    }
  }

  return NextResponse.json({ error: "Photo not found" }, { status: 404 });
}
