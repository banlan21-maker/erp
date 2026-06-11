/**
 * 납품처(고객) 마스터 — 절단·가공부재 출고처
 *
 * GET  /api/delivery-vendors        목록 (전체 또는 isActive 필터)
 * POST /api/delivery-vendors        신규 등록 (이름만 필수)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const norm = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const includeInactive = sp.get("includeInactive") === "1";

    const list = await prisma.deliveryVendor.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: list.map(v => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = norm(body?.name);
    if (!name) {
      return NextResponse.json({ success: false, error: "상호(이름)는 필수입니다." }, { status: 400 });
    }

    const created = await prisma.deliveryVendor.create({
      data: {
        name,
        bizNo:        norm(body?.bizNo),
        ceo:          norm(body?.ceo),
        address:      norm(body?.address),
        bizType:      norm(body?.bizType),
        bizItem:      norm(body?.bizItem),
        phone:        norm(body?.phone),
        fax:          norm(body?.fax),
        contactName:  norm(body?.contactName),
        contactPhone: norm(body?.contactPhone),
        memo:         norm(body?.memo),
        isActive:     body?.isActive === false ? false : true,
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...created, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() },
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "등록 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
