export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractBomData } from "@/lib/bom-parser";
import type { BomVendorPreset } from "@/lib/bom-parser";

/** POST /api/bom — 파싱 + 미리보기 OR DB 저장
 *
 * FormData 필드:
 *   file      — 엑셀 파일 (multipart)
 *   vendorId  — BomVendor ID
 *   action    — "preview" | "save"
 *   projectId — 저장 시 연결할 Project ID (action=save 시 필수)
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file     = form.get("file")     as File   | null;
  const vendorId = form.get("vendorId") as string | null;
  const action   = form.get("action")   as string | null;  // "preview" | "save"
  const projectId= form.get("projectId")as string | null;

  if (!file || !vendorId) {
    return NextResponse.json({ error: "file, vendorId 필수" }, { status: 400 });
  }

  const vendor = await prisma.bomVendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return NextResponse.json({ error: "업체 없음" }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const preset = vendor.preset as unknown as BomVendorPreset;
  const rows   = extractBomData(buffer, preset);

  if (action === "save") {
    if (!projectId) return NextResponse.json({ error: "projectId 필수" }, { status: 400 });

    // 기존 BomItem 삭제 후 재등록 (덮어쓰기)
    await prisma.bomItem.deleteMany({ where: { projectId } });

    await prisma.bomItem.createMany({
      data: rows.map((r) => ({
        projectId,
        vendorId,
        hosin:     String(r["호선"]    ?? ""),
        block:     String(r["블록"]    ?? ""),
        partName:  String(r["파트명"]  ?? ""),
        thickness: r["두께"]    != null ? String(r["두께"])    : null,
        size:      r["사이즈"]  != null ? String(r["사이즈"])  : null,
        material:  r["재질"]    != null ? String(r["재질"])    : null,
        process:   r["가공"]    != null ? String(r["가공"])    : null,
        qty:       r["수량"]    != null ? Number(r["수량"])    : null,
        weight:    r["중량(kg)"]!= null ? Number(r["중량(kg)"]): null,
        nestNo:    r["NEST NO"] != null ? String(r["NEST NO"]): null,
        sourceFile: file.name,
      })),
    });

    return NextResponse.json({ ok: true, count: rows.length });
  }

  // preview
  const totalQty = rows.reduce((s, r) => s + (Number(r["수량"]) || 0), 0);
  const totalWt  = rows.reduce((s, r) => s + (Number(r["중량(kg)"]) || 0), 0);
  return NextResponse.json({
    rows:      rows.slice(0, 50),   // 미리보기 최대 50행
    total:     rows.length,
    totalQty,
    totalWt:   Math.round(totalWt * 1000) / 1000,
    fieldLabels: (preset.field_labels ?? {}),
  });
}

/** GET /api/bom?projectId=xxx — 저장된 BOM 목록 조회 */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json([], { status: 200 });

  const items = await prisma.bomItem.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { vendor: { select: { name: true } } },
  });
  return NextResponse.json(items);
}

/** DELETE /api/bom?projectId=xxx — BOM 전체 삭제 */
export async function DELETE(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId 필수" }, { status: 400 });
  await prisma.bomItem.deleteMany({ where: { projectId } });
  return NextResponse.json({ ok: true });
}
