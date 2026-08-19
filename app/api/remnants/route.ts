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

/* ── 조건별 검색 (칸 안은 쉼표 = OR, 칸끼리는 AND) ───────────────────────────
   강재전체목록·작업일보관리와 같은 규약:
     · 숫자 칸(두께·폭·길이) = 완전일치 OR 목록
     · 글자 칸(위치·확정정보) = 부분일치 OR 목록
     · 폭/길이는 폭1·폭2(길이1·길이2) **어느 쪽이든** 맞으면 통과 (L자형 대응)          */
const splitQ = (v: string | null) =>
  (v ?? "").split(",").map(x => x.trim()).filter(Boolean);

const numOrCond = (raw: string | null, fields: string[]) => {
  const nums = splitQ(raw).map(Number).filter(n => !Number.isNaN(n));
  if (!nums.length) return null;
  return { OR: fields.map(f => ({ [f]: { in: nums } })) };
};

const textOrCond = (raw: string | null, fields: string[]) => {
  const vals = splitQ(raw);
  if (!vals.length) return null;
  const conds = vals.flatMap(v =>
    fields.map(f => ({ [f]: { contains: v, mode: "insensitive" as const } })));
  return { OR: conds };
};

// 확정정보 = reservedFor(직접 확정) 또는 배정된 도면의 호선/블록
const reservedCond = (raw: string | null) => {
  const vals = splitQ(raw);
  if (!vals.length) return null;
  const conds = vals.flatMap(v => ([
    { reservedFor: { contains: v, mode: "insensitive" as const } },
    { assignedToLists: { some: { OR: [
      { block: { contains: v, mode: "insensitive" as const } },
      { project: { projectCode: { contains: v, mode: "insensitive" as const } } },
    ] } } },
  ]));
  return { OR: conds };
};

// 상태 — 화면 표기(재고/확정/소진) 기준. 확정은 status 가 아니라 reservedFor 로 갈린다.
//   재고 = IN_STOCK 이면서 미확정 / 확정 = 소진 아니면서 reservedFor 있음 / 소진 = EXHAUSTED
const statusCond = (raw: string | null) => {
  const vals = splitQ(raw).map(v => v.toUpperCase());
  if (!vals.length) return null;
  const conds: object[] = [];
  const has = (...keys: string[]) => keys.some(k => vals.includes(k));
  if (has("재고", "IN_STOCK"))  conds.push({ status: "IN_STOCK", reservedFor: null });
  if (has("확정", "RESERVED"))  conds.push({ status: { not: "EXHAUSTED" }, NOT: { reservedFor: null } });
  if (has("소진", "EXHAUSTED")) conds.push({ status: "EXHAUSTED" });
  if (!conds.length) return null;
  return conds.length === 1 ? conds[0] : { OR: conds };
};

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
        select: { id: true, remnantNo: true, type: true, shape: true, material: true, thickness: true, weight: true, width1: true, length1: true, width2: true, length2: true, sideA: true, sideB: true, sideC: true, status: true, reservedFor: true },
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
    const reservedFors = parseList(sp.get("reservedFors"));
    const onlyAvailable = sp.get("onlyAvailable") === "true"; // 미확정(reservedFor=null)만

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
      ...nullableIn(reservedFors, "reservedFor"),
      ...(onlyAvailable ? { reservedFor: null } : {}),
      ...buildSourceFilter(sources),
    };

    // 조건별 검색 — 각 조건은 자체 OR 를 갖고, 조건끼리는 AND.
    // where 최상위 OR 는 free-text search 가 이미 쓰고 있어 AND 배열로 합류시킨다.
    const andConds = [
      numOrCond(sp.get("qThickness"), ["thickness"]),
      numOrCond(sp.get("qWidth"),     ["width1", "width2"]),
      numOrCond(sp.get("qLength"),    ["length1", "length2"]),
      textOrCond(sp.get("qLocation"), ["location"]),
      statusCond(sp.get("qStatus")),
      reservedCond(sp.get("qReserved")),
    ].filter(Boolean) as object[];
    if (andConds.length) where.AND = andConds;

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
      width1, length1, width2, length2, sideA, sideB, sideC,
      sourceProjectId, sourceVesselName, sourceBlock, heatNo,
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
        material: material.trim().toUpperCase(),
        thickness: Number(thickness),
        weight:    Number(weight),
        width1:    width1    != null ? Number(width1)  : null,
        length1:   length1   != null ? Number(length1) : null,
        width2:    width2    != null ? Number(width2)  : null,
        length2:   length2   != null ? Number(length2) : null,
        // 삼각형 실측 세 변 (width1/length1 에는 이걸로 계산한 외접 사각형이 저장됨)
        sideA:     sideA     != null ? Number(sideA)   : null,
        sideB:     sideB     != null ? Number(sideB)   : null,
        sideC:     sideC     != null ? Number(sideC)   : null,
        sourceProjectId: sourceProjectId || null,
        sourceVesselName: sourceVesselName?.trim() || null,
        sourceBlock: sourceBlock?.trim() || null,
        heatNo: heatNo?.trim() || null,
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
