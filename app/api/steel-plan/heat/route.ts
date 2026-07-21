export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

const parseList = (v: string | null) => v?.split(",").filter(Boolean) ?? [];

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const search    = sp.get("search") || undefined;
  const all       = sp.get("all")    === "true";
  const page      = Math.max(1, parseInt(sp.get("page") || "1"));

  const vesselCodes    = parseList(sp.get("vesselCodes"));
  const materials      = parseList(sp.get("materials"));
  // 검색패널 판번호/호선/재질 — 부분검색(contains), 칸 안 여러 값 OR (컬럼 드롭다운 in 과 별개)
  const heatNoSearch   = parseList(sp.get("heatNoSearch"));
  const vesselSearch   = parseList(sp.get("vesselSearch"));
  const materialSearch = parseList(sp.get("materialSearch"));
  const thicknesses    = parseList(sp.get("thicknesses")).map(Number).filter((n) => !isNaN(n));
  const widths         = parseList(sp.get("widths")).map(Number).filter((n) => !isNaN(n));
  const lengths        = parseList(sp.get("lengths")).map(Number).filter((n) => !isNaN(n));
  const heatNos        = parseList(sp.get("heatNos"));
  const statuses       = parseList(sp.get("statuses")) as ("WAITING" | "CUT")[];
  const uploadBatchNos = parseList(sp.get("uploadBatchNos"));
  const ids            = parseList(sp.get("ids"));

  const nullableIn = (values: string[], field: string) => {
    if (!values.length) return {};
    const hasNull = values.includes("__NULL__");
    const nonNull = values.filter((v) => v !== "__NULL__");
    if (hasNull && nonNull.length) return { OR: [{ [field]: null }, { [field]: { in: nonNull } }] };
    if (hasNull) return { [field]: null };
    return { [field]: { in: nonNull } };
  };

  const where = {
    archivedAt: null, // 아카이브(숨김) 제외
    ...(ids.length ? { id: { in: ids } } : {}),
    ...(search
      ? { OR: [
          { vesselCode: { contains: search, mode: "insensitive" as const } },
          { material:   { contains: search, mode: "insensitive" as const } },
          { heatNo:     { contains: search, mode: "insensitive" as const } },
        ]}
      : {}),
    ...(vesselCodes.length ? { vesselCode: { in: vesselCodes } } : {}),
    ...(materials.length   ? { material:   { in: materials } }   : {}),
    // 검색패널 부분검색 — 필드끼리 AND, 필드 안 여러 값 OR (contains, 대소문자 무시)
    ...((heatNoSearch.length || vesselSearch.length || materialSearch.length) ? { AND: [
      ...(heatNoSearch.length   ? [{ OR: heatNoSearch.map(h   => ({ heatNo:     { contains: h, mode: "insensitive" as const } })) }] : []),
      ...(vesselSearch.length   ? [{ OR: vesselSearch.map(v   => ({ vesselCode: { contains: v, mode: "insensitive" as const } })) }] : []),
      ...(materialSearch.length ? [{ OR: materialSearch.map(m => ({ material:   { contains: m, mode: "insensitive" as const } })) }] : []),
    ] } : {}),
    ...(thicknesses.length ? { thickness:  { in: thicknesses } } : {}),
    ...(widths.length      ? { width:      { in: widths } }      : {}),
    ...(lengths.length     ? { length:     { in: lengths } }     : {}),
    ...(heatNos.length     ? { heatNo:     { in: heatNos } }     : {}),
    ...(statuses.length    ? { status:     { in: statuses } }    : {}),
    ...nullableIn(uploadBatchNos, "uploadBatchNo"),
  };

  const [total, rows, allVessels] = await Promise.all([
    prisma.steelPlanHeat.count({ where }),
    prisma.steelPlanHeat.findMany({
      where,
      orderBy: [{ vesselCode: "asc" }, { createdAt: "asc" }],
      ...(all ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    }),
    prisma.steelPlanHeat.findMany({
      select:   { vesselCode: true },
      distinct: ["vesselCode"],
      orderBy:  { vesselCode: "asc" },
    }),
  ]);

  return NextResponse.json({
    data:        rows,
    total,
    page,
    totalPages:  Math.ceil(total / PAGE_SIZE),
    vesselCodes: allVessels.map((v) => v.vesselCode),
  });
}

// DELETE /api/steel-plan/heat
// body: { ids: string[] } — 선택된 판번호 일괄 삭제
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids 필요" }, { status: 400 });
  }
  const { count } = await prisma.steelPlanHeat.deleteMany({ where: { id: { in: body.ids } } });
  return NextResponse.json({ count });
}

/**
 * POST /api/steel-plan/heat
 * 판번호(SteelPlanHeat) 만 독립 등록 — 강재(SteelPlan) 와 별개.
 * 강재 등록/절단완료/외부출고 자동생성 이외의 경로가 없어 신설 (N1 대응).
 *
 * body: { items: [{ vesselCode, material, thickness, width, length, heatNo }, ...] }
 *   - status 는 항상 WAITING 으로 시작 (사용 전 재고)
 *   - createdAt 은 배치 내 순서 유지
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "등록할 판번호가 없습니다." }, { status: 400 });
    }

    // 각 항목 검증 + normalize
    const rows: {
      vesselCode: string; material: string;
      thickness: number; width: number; length: number;
      heatNo: string; status: "WAITING";
    }[] = [];
    for (const raw of items) {
      const vesselCode = String(raw?.vesselCode ?? "").trim();
      const material   = String(raw?.material   ?? "").trim().toUpperCase();
      const thickness  = Number(raw?.thickness);
      const width      = Number(raw?.width);
      const length     = Number(raw?.length);
      const heatNo     = String(raw?.heatNo ?? "").trim().toUpperCase();
      if (!vesselCode || !material || !heatNo) continue;
      if (!Number.isFinite(thickness) || !Number.isFinite(width) || !Number.isFinite(length)) continue;
      if (thickness <= 0 || width <= 0 || length <= 0) continue;
      rows.push({ vesselCode, material, thickness, width, length, heatNo, status: "WAITING" });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: "유효한 판번호가 없습니다. 호선·재질·두께·폭·길이·판번호가 모두 있어야 합니다.",
      }, { status: 400 });
    }

    const { count } = await prisma.steelPlanHeat.createMany({ data: rows });
    return NextResponse.json({ success: true, count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "판번호 등록 실패";
    console.error("[POST /api/steel-plan/heat]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
