/**
 * 장비 사진 업로드/삭제 — slot 1 또는 2
 *
 * POST /api/mgmt-equipment/[id]/photo?slot=1   (multipart 'file')
 * DELETE /api/mgmt-equipment/[id]/photo?slot=1
 *
 * 저장 위치: /public/uploads/equipment/{id}/{slot}.{ext}
 * 클라이언트가 이미 압축한 이미지를 받음 (lib/image-compress.ts)
 * 서버는 5MB 제한만 검사하고 그대로 저장.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB (압축 후라 충분히 큼)
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function parseSlot(req: NextRequest): 1 | 2 | null {
  const v = req.nextUrl.searchParams.get("slot");
  if (v === "1" || v === "2") return Number(v) as 1 | 2;
  return null;
}

function slotField(slot: 1 | 2): "photoUrl1" | "photoUrl2" {
  return slot === 1 ? "photoUrl1" : "photoUrl2";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slot = parseSlot(req);
  if (!slot) return NextResponse.json({ success: false, error: "slot=1 또는 2 필요" }, { status: 400 });

  const equipment = await prisma.mgmtEquipment.findUnique({ where: { id }, select: { id: true } });
  if (!equipment) return NextResponse.json({ success: false, error: "장비를 찾을 수 없습니다." }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "file 필드가 필요합니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: `파일이 너무 큽니다 (최대 ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 413 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ success: false, error: "JPEG/PNG/WEBP 만 허용" }, { status: 415 });
  }

  // 디렉터리 생성
  const dir = path.join(process.cwd(), "public", "uploads", "equipment", id);
  await mkdir(dir, { recursive: true });

  // 확장자
  const ext = file.type === "image/png"  ? "png"
            : file.type === "image/webp" ? "webp"
            : "jpg";

  // 동일 slot의 기존 파일들 삭제 (확장자 변경 케이스)
  for (const oldExt of ["jpg", "jpeg", "png", "webp"]) {
    try { await unlink(path.join(dir, `${slot}.${oldExt}`)); } catch { /* ignore */ }
  }

  const filename = `${slot}.${ext}`;
  const filepath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  // 캐시버스터 — 같은 URL이어도 업데이트 즉시 반영
  const photoUrl = `/uploads/equipment/${id}/${filename}?t=${Date.now()}`;

  const updated = await prisma.mgmtEquipment.update({
    where: { id },
    data:  { [slotField(slot)]: photoUrl },
    select: { photoUrl1: true, photoUrl2: true },
  });

  return NextResponse.json({ success: true, data: { ...updated, slot, size: file.size } });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const slot = parseSlot(req);
  if (!slot) return NextResponse.json({ success: false, error: "slot=1 또는 2 필요" }, { status: 400 });

  const dir = path.join(process.cwd(), "public", "uploads", "equipment", id);
  for (const oldExt of ["jpg", "jpeg", "png", "webp"]) {
    try { await unlink(path.join(dir, `${slot}.${oldExt}`)); } catch { /* ignore */ }
  }

  const updated = await prisma.mgmtEquipment.update({
    where: { id },
    data:  { [slotField(slot)]: null },
    select: { photoUrl1: true, photoUrl2: true },
  });

  return NextResponse.json({ success: true, data: updated });
}
