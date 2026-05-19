import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 잔재번호 자동채번: REM-YYYY-NNN
async function generateRemnantNo(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REM-${year}-`;
  const last = await prisma.remnant.findFirst({
    where: { remnantNo: { startsWith: prefix } },
    orderBy: { remnantNo: "desc" },
  });
  const seq = last ? parseInt(last.remnantNo.split("-")[2], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

const PAGE_SIZE = 50;
const parseList = (v: string | null) => v?.split(",").filter(Boolean) ?? [];

function nullableIn(values: string[], field: string) {
  if (!values.length) return {};
  const hasNull = values.includes("__NULL__");
  const nonNull = values.filter(v => v !== "__NULL__");
  if (hasNull && nonNull.length) return { OR: [{ [field]: null }, { [field]: { in: nonNull } }] };
  if (hasNull) return { [field]: null };
  return { [field]: { in: nonNull } };
}

// source 필터: "P:코드" → 프로젝트 매칭, "V:이름" → vesselName 매칭, "__NULL__" → 둘 다 null
function buildSourceFilter(sources: string[]) {
  if (!sources.length) return {};
  const hasNull   = sources.includes("__NULL__");
  const projectCodes = sources.filter(s => s.startsWith("P:")).map(s => s.slice(2));
  const vesselNames  = sources.filter(s => s.startsWith("V:")).map(s => s.slice(2));
  const conditions: object[] = [
    ...(hasNull ? [{ sourceProjectId: null, sourceVesselName: null }] : []),
    ...(projectCodes.length ? [{ sourceProject: { projectCode: { in: projectCodes } } }] : []),
    ...(vesselNames.length  ? [{ sourceVesselName: { in: vesselNames } }] : []),
  ];
  if (!conditions.length) return {};
  if (conditions.length === 1) return conditions[0];
  return { OR: conditions };
}

// GET /api/remnants
// page 파라미터 있음 → 페이지네이션 응답 { data, total, totalPages }
// page 파라미터 없음 → 전체 목록 응답 { success, data } (하위 호환)
export async function GET(request: NextRequest) {
  try {
    const sp = new URL(request.url).searchParams;

    const status    = sp.get("status");
    const type      = sp.get("type");
    const shape     = sp.get("shape");
    const material  = sp.get("material");
    const projectId = sp.get("projectId");
    const idsParam  = sp.get("ids");
    const search    = sp.get("search") || undefined;
    const pageParam = sp.get("page");

    // ── ids 파라미터: 특정 ID 목록 조회 (드로잉테이블 잔재 상세용) ──────────
    if (idsParam) {
      const ids = idsParam.split(",").filter(Boolean);
      const remnants = await prisma.remnant.findMany({
        where: { id: { in: ids } },
        select: { id: true, remnantNo: true, shape: true, material: true, thickness: true, weight: true, width1: true, length1: true, width2: true, length2: true, status: true },
      });
      return NextResponse.json({ success: true, data: remnants });
    }

    // ── 컬럼 필터 파라미터 (page 있을 때만 서버사이드 필터링) ────────────────
    const types      = parseList(sp.get("types"));
    const shapes     = parseList(sp.get("shapes"));
    const materials  = parseList(sp.get("materials"));
    const thicknesses = parseList(sp.get("thicknesses")).map(Number).filter(n => !isNaN(n));
    const widths1    = parseList(sp.get("widths1")).map(Number).filter(n => !isNaN(n));
    const lengths1   = parseList(sp.get("lengths1")).map(Number).filter(n => !isNaN(n));
    const widths2    = parseList(sp.get("widths2")).map(Number).filter(n => !isNaN(n));
    const lengths2   = parseList(sp.get("lengths2")).map(Number).filter(n => !isNaN(n));
    const weights    = parseList(sp.get("weights")).map(Number).filter(n => !isNaN(n));
    const statuses   = parseList(sp.get("statuses"));
    const locations  = parseList(sp.get("locations"));
    const heatNos    = parseList(sp.get("heatNos"));
    const sources    = parseList(sp.get("sources"));
    const sourceBlocks = parseList(sp.get("sourceBlocks"));

    const where: Record<string, unknown> = {
      // 단일값 파라미터 (하위 호환)
      ...(status    ? { status }                                              : {}),
      ...(type      ? { type }                                                : {}),
      ...(shape     ? { shape }                                               : {}),
      ...(material  ? { material: { contains: material, mode: "insensitive" } } : {}),
      ...(projectId ? { sourceProjectId: projectId }                         : {}),
      // 검색
      ...(search ? { OR: [
        { remnantNo:        { contains: search, mode: "insensitive" } },
        { material:         { contains: search, mode: "insensitive" } },
        { sourceVesselName: { contains: search, mode: "insensitive" } },
        { sourceBlock:      { contains: search, mode: "insensitive" } },
        { location:         { contains: search, mode: "insensitive" } },
        { registeredBy:     { contains: search, mode: "insensitive" } },
      ]} : {}),
      // 컬럼 IN 필터
      ...(types.length       ? { type:      { in: types } }      : {}),
      ...(shapes.length      ? { shape:     { in: shapes } }     : {}),
      ...(materials.length   ? { material:  { in: materials } }  : {}),
      ...(thicknesses.length ? { thickness: { in: thicknesses } } : {}),
      ...(widths1.length     ? { width1:    { in: widths1 } }    : {}),
      ...(lengths1.length    ? { length1:   { in: lengths1 } }   : {}),
      ...(widths2.length     ? { width2:    { in: widths2 } }    : {}),
      ...(lengths2.length    ? { length2:   { in: lengths2 } }   : {}),
      ...(weights.length     ? { weight:    { in: weights } }    : {}),
      ...(statuses.length    ? { status:    { in: statuses } }   : {}),
      ...nullableIn(locations,    "location"),
      ...nullableIn(heatNos,      "heatNo"),
      ...nullableIn(sourceBlocks, "sourceBlock"),
      ...buildSourceFilter(sources),
    };

    const include = {
      sourceProject: { select: { id: true, projectCode: true, projectName: true } },
      assignedToLists: {
        select: { block: true, project: { select: { projectCode: true } } },
      },
    };

    // ── page 파라미터 있음 → 페이지네이션 ──────────────────────────────────
    if (pageParam !== null) {
      const page = Math.max(1, parseInt(pageParam || "1"));
      const [total, data] = await Promise.all([
        prisma.remnant.count({ where }),
        prisma.remnant.findMany({
          where,
          include,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
      ]);
      return NextResponse.json({ data, total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
    }

    // ── page 없음 → 전체 반환 (하위 호환) ───────────────────────────────────
    const remnants = await prisma.remnant.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: remnants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/remnants
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      remnantNo: customNo,
      type, shape, material, thickness, weight,
      width1, length1, width2, length2,
      sourceProjectId, sourceVesselName, sourceBlock,
      location, registeredBy, memo,
    } = body;

    if (!type || !shape || !material || thickness == null || weight == null || !registeredBy) {
      return NextResponse.json({ success: false, error: "필수 항목이 누락됐습니다." }, { status: 400 });
    }

    // 잔재번호: 사용자 입력 우선, 없으면 자동채번
    let remnantNo: string;
    if (customNo?.trim()) {
      const exists = await prisma.remnant.findUnique({ where: { remnantNo: customNo.trim() } });
      if (exists) return NextResponse.json({ success: false, error: `잔재번호 '${customNo.trim()}'이 이미 사용 중입니다.` }, { status: 409 });
      remnantNo = customNo.trim();
    } else {
      remnantNo = await generateRemnantNo();
    }

    const remnant = await prisma.remnant.create({
      data: {
        remnantNo,
        type,
        shape,
        material: material.trim(),
        thickness: Number(thickness),
        weight:    Number(weight),
        width1:    width1    != null ? Number(width1)  : null,
        length1:   length1   != null ? Number(length1) : null,
        width2:    width2    != null ? Number(width2)  : null,
        length2:   length2   != null ? Number(length2) : null,
        sourceProjectId: sourceProjectId || null,
        sourceVesselName: sourceVesselName?.trim() || null,
        sourceBlock: sourceBlock?.trim() || null,
        location:  location?.trim() || null,
        registeredBy: registeredBy.trim(),
        memo: memo?.trim() || null,
        status: "IN_STOCK", // 등록 즉시 재고로 분류 (PENDING 단계 미사용)
      },
      include: {
        sourceProject: { select: { id: true, projectCode: true, projectName: true } },
      },
    });

    return NextResponse.json({ success: true, data: remnant });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
