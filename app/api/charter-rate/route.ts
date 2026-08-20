import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 용차 단가표 관리 — 납품처별 기본단가 + 폭 구간별 할증.
 *
 * GET    /api/charter-rate                → { rates, surcharges }
 * POST   /api/charter-rate                { kind: "rate"|"surcharge", ...필드 }  신규
 * PATCH  /api/charter-rate                { kind, id, ...필드 }                  수정
 * DELETE /api/charter-rate?kind=&id=                                             삭제
 *
 * 초기값은 scripts/seed-charter-rate.mjs 가 과거 실적을 역산해 넣어 두었고,
 * 단가가 바뀌면 여기서 사용자가 고친다.
 */

export async function GET() {
  try {
    const [rates, surcharges] = await Promise.all([
      prisma.charterRate.findMany({ orderBy: [{ region: "asc" }, { deliveryName: "asc" }] }),
      prisma.charterSurcharge.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);
    return NextResponse.json({ success: true, data: { rates, surcharges } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 오류" }, { status: 500 });
  }
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (b?.kind === "surcharge") {
      const minWidth = num(b.minWidth);
      const amount = num(b.amount);
      if (minWidth == null || amount == null) {
        return NextResponse.json({ success: false, error: "시작 폭과 할증액은 필수입니다." }, { status: 400 });
      }
      const maxWidth = b.maxWidth === "" || b.maxWidth == null ? null : num(b.maxWidth);
      const data = await prisma.charterSurcharge.create({
        data: {
          minWidth, maxWidth, amount,
          label: b.label?.toString().trim() || `${minWidth}-${maxWidth ?? ""}`,
          sortOrder: num(b.sortOrder) ?? minWidth,
        },
      });
      return NextResponse.json({ success: true, data }, { status: 201 });
    }

    const deliveryName = b?.deliveryName?.toString().trim();
    const baseCost = num(b?.baseCost);
    if (!deliveryName) return NextResponse.json({ success: false, error: "납품처명은 필수입니다." }, { status: 400 });
    if (baseCost == null) return NextResponse.json({ success: false, error: "기본단가는 필수입니다." }, { status: 400 });
    const exists = await prisma.charterRate.findUnique({ where: { deliveryName } });
    if (exists) return NextResponse.json({ success: false, error: `'${deliveryName}' 단가가 이미 있습니다.` }, { status: 409 });
    const data = await prisma.charterRate.create({
      data: { deliveryName, baseCost, region: b.region?.toString().trim() || null, memo: b.memo?.toString().trim() || null },
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "등록 오류" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const id = b?.id?.toString();
    if (!id) return NextResponse.json({ success: false, error: "id 가 필요합니다." }, { status: 400 });

    if (b?.kind === "surcharge") {
      const data = await prisma.charterSurcharge.update({
        where: { id },
        data: {
          ...(b.minWidth !== undefined ? { minWidth: num(b.minWidth) ?? 0 } : {}),
          ...(b.maxWidth !== undefined ? { maxWidth: b.maxWidth === "" || b.maxWidth == null ? null : num(b.maxWidth) } : {}),
          ...(b.amount !== undefined ? { amount: num(b.amount) ?? 0 } : {}),
          ...(b.label !== undefined ? { label: b.label?.toString().trim() || null } : {}),
        },
      });
      return NextResponse.json({ success: true, data });
    }

    const data = await prisma.charterRate.update({
      where: { id },
      data: {
        ...(b.deliveryName !== undefined ? { deliveryName: b.deliveryName.toString().trim() } : {}),
        ...(b.baseCost !== undefined ? { baseCost: num(b.baseCost) ?? 0 } : {}),
        ...(b.region !== undefined ? { region: b.region?.toString().trim() || null } : {}),
        ...(b.memo !== undefined ? { memo: b.memo?.toString().trim() || null } : {}),
      },
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "수정 오류" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = sp.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id 가 필요합니다." }, { status: 400 });
    if (sp.get("kind") === "surcharge") await prisma.charterSurcharge.delete({ where: { id } });
    else await prisma.charterRate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "삭제 오류" }, { status: 500 });
  }
}
