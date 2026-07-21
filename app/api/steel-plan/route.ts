export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { validateName } from "@/lib/validate-name";

const PAGE_SIZE = 50;

const parseList = (v: string | null) => v?.split(",").filter(Boolean) ?? [];

/** null 포함 가능한 IN 필터 조건 빌드 */
function nullableIn(values: string[], field: string) {
  if (!values.length) return {};
  const hasNull  = values.includes("__NULL__");
  const nonNull  = values.filter((v) => v !== "__NULL__");
  if (hasNull && nonNull.length) return { OR: [{ [field]: null }, { [field]: { in: nonNull } }] };
  if (hasNull)  return { [field]: null };
  return { [field]: { in: nonNull } };
}

/** 날짜 배열 → 지정 필드 OR 조건 */
function buildDateFilter(dates: string[], field: string) {
  if (!dates.length) return {};
  const hasNull   = dates.includes("__NULL__");
  const dateParts = dates.filter((d) => d !== "__NULL__");
  const ranges = dateParts.map((d) => ({
    [field]: {
      gte: new Date(`${d}T00:00:00.000Z`),
      lt:  new Date(new Date(`${d}T00:00:00.000Z`).getTime() + 86_400_000),
    },
  }));
  const conditions: object[] = [
    ...(hasNull ? [{ [field]: null }] : []),
    ...ranges,
  ];
  if (!conditions.length) return {};
  if (conditions.length === 1) return conditions[0];
  return { OR: conditions };
}

// GET /api/steel-plan
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const search          = sp.get("search")          || undefined;
  const all             = sp.get("all")             === "true";
  const page            = Math.max(1, parseInt(sp.get("page") || "1"));
  const SORTABLE        = ["vesselCode","material","thickness","width","length","status","receivedAt","storageLocation","reservedFor","selectionPrintedAt","issuedAt","uploadBatchNo","createdAt"] as const;
  const sortByCols      = (sp.get("sortBy") || "").split(",").filter(Boolean);
  const sortDirCols     = (sp.get("sortDir") || "").split(",");
  const sortKeys        = sortByCols
    .map((col, i) => ({ col, dir: (sortDirCols[i] === "desc" ? "desc" : "asc") as "asc" | "desc" }))
    .filter((k) => (SORTABLE as readonly string[]).includes(k.col));

  // Column IN filters
  const vesselCodes     = parseList(sp.get("vesselCodes"));
  const materials       = parseList(sp.get("materials"));
  // 검색패널 호선/재질 — 부분검색(contains), 칸 안 여러 값 OR (컬럼 드롭다운의 in 과 별개)
  const vesselSearch    = parseList(sp.get("vesselSearch"));
  const materialSearch  = parseList(sp.get("materialSearch"));
  const thicknesses     = parseList(sp.get("thicknesses")).map(Number).filter((n) => !isNaN(n));
  const widths          = parseList(sp.get("widths")).map(Number).filter((n) => !isNaN(n));
  const lengths         = parseList(sp.get("lengths")).map(Number).filter((n) => !isNaN(n));
  const statuses        = parseList(sp.get("statuses")) as ("REGISTERED" | "RECEIVED" | "COMPLETED")[];
  const receivedDates      = parseList(sp.get("receivedDates"));
  const storageLocations   = parseList(sp.get("storageLocations"));
  const reservedFors       = parseList(sp.get("reservedFors"));
  const actualHeatNos      = parseList(sp.get("actualHeatNos"));
  const actualVesselCodes  = parseList(sp.get("actualVesselCodes"));
  const actualDrawingNos   = parseList(sp.get("actualDrawingNos"));
  const uploadBatchNos        = parseList(sp.get("uploadBatchNos"));
  const selectionPrintedDates = parseList(sp.get("selectionPrintedDates"));
  const issuedDates           = parseList(sp.get("issuedDates"));
  const ids                   = parseList(sp.get("ids"));
  // 메모 필터 — "has" (메모 있음만) / "none" (메모 없음만) / 빈값 (전체)
  const memoMode     = sp.get("memoMode"); // "has" | "none" | null
  // 선별 목록 — 출고 선별(shipoutMarkedAt) 마킹된 강재만
  const shipoutMarked = sp.get("shipoutMarked") === "true";

  const where = {
    archivedAt: null, // 아카이브(숨김) 제외
    ...(ids.length ? { id: { in: ids } } : {}),
    ...(search
      ? { OR: [
          { vesselCode: { contains: search, mode: "insensitive" as const } },
          { material:   { contains: search, mode: "insensitive" as const } },
        ]}
      : {}),
    ...(vesselCodes.length  ? { vesselCode: { in: vesselCodes } }  : {}),
    ...(materials.length    ? { material:   { in: materials } }    : {}),
    // 검색패널 호선/재질 부분검색 — 필드끼리 AND, 필드 안 여러 값 OR (contains, 대소문자 무시)
    ...((vesselSearch.length || materialSearch.length) ? { AND: [
      ...(vesselSearch.length   ? [{ OR: vesselSearch.map(v   => ({ vesselCode: { contains: v, mode: "insensitive" as const } })) }] : []),
      ...(materialSearch.length ? [{ OR: materialSearch.map(m => ({ material:   { contains: m, mode: "insensitive" as const } })) }] : []),
    ] } : {}),
    ...(thicknesses.length  ? { thickness:  { in: thicknesses } }  : {}),
    ...(widths.length       ? { width:      { in: widths } }       : {}),
    ...(lengths.length      ? { length:     { in: lengths } }      : {}),
    ...(statuses.length     ? { status:     { in: statuses } }     : {}),
    ...buildDateFilter(receivedDates, "receivedAt"),
    ...buildDateFilter(selectionPrintedDates, "selectionPrintedAt"),
    ...buildDateFilter(issuedDates, "issuedAt"),
    ...nullableIn(storageLocations,  "storageLocation"),
    ...nullableIn(reservedFors,      "reservedFor"),
    ...nullableIn(actualHeatNos,     "actualHeatNo"),
    ...nullableIn(actualVesselCodes, "actualVesselCode"),
    ...nullableIn(actualDrawingNos,  "actualDrawingNo"),
    ...nullableIn(uploadBatchNos,    "uploadBatchNo"),
    // 메모 있음/없음 (빈 문자열은 has 에 포함되지 않음)
    ...(memoMode === "has"  ? { memo: { not: null } } : {}),
    ...(memoMode === "none" ? { memo: null } : {}),
    // 선별 목록 — 출고 선별 마킹된 강재만
    ...(shipoutMarked ? { shipoutMarkedAt: { not: null } } : {}),
  };

  const [total, rows, allVessels] = await Promise.all([
    prisma.steelPlan.count({ where }),
    prisma.steelPlan.findMany({
      where,
      orderBy: sortKeys.length
        ? [...sortKeys.map((k) => ({ [k.col]: k.dir })), { createdAt: "asc" }]
        : [{ vesselCode: "asc" }, { createdAt: "asc" }],
      ...(all ? {} : { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    }),
    prisma.steelPlan.findMany({
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

// 업로드 배치번호 생성: YYYYMMDD-NN  (한국시간 KST 기준 날짜)
// 해당 날짜의 기존 업로드번호 중 최대 순번 + 1 (예: 20260615-01, -02, -03)
// 중간 번호(-02)를 지워도 기존 -01/-03 은 그대로 유지되고, 다음 업로드는 최대값+1 로 이어짐
// 트랜잭션 클라이언트(tx)로 읽어 같은 트랜잭션의 createMany 와 원자적으로 묶음
async function genBatchNo(tx: Prisma.TransactionClient): Promise<string> {
  // Docker 컨테이너가 UTC 여도 한국 달력 날짜로 발번 (en-CA → "2026-06-15")
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const prefix = `${kstDate.replace(/-/g, "")}-`;   // "20260615-"

  // 같은 날짜의 기존 업로드번호 조회 (steelPlan + steelPlanHeat 양쪽 — 일부만 남아도 재사용 방지)
  const [plans, heats] = await Promise.all([
    tx.steelPlan.findMany({
      where: { uploadBatchNo: { startsWith: prefix } },
      select: { uploadBatchNo: true }, distinct: ["uploadBatchNo"],
    }),
    tx.steelPlanHeat.findMany({
      where: { uploadBatchNo: { startsWith: prefix } },
      select: { uploadBatchNo: true }, distinct: ["uploadBatchNo"],
    }),
  ]);

  let maxSeq = 0;
  for (const { uploadBatchNo } of [...plans, ...heats]) {
    const seq = Number(uploadBatchNo?.split("-")[1]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;
}

// POST /api/steel-plan
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items: {
    vesselCode: string; material: string; thickness: number;
    width: number; length: number; heatNo?: string | null;
    memo?: string | null; sourceFile?: string | null;
  }[] = Array.isArray(body) ? body : [body];

  // 입력 검증 — 호선코드에 필터(콤마 구분)·경로를 깨뜨리는 문자가 들어오면 기록 차단 + 안내
  for (const item of items) {
    const err = validateName(item.vesselCode, "호선");
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  // 발번 + 적재를 한 트랜잭션으로 — 부분 실패/중복번호 방지
  const { uploadBatchNo, count } = await prisma.$transaction(async (tx) => {
    const uploadBatchNo = await genBatchNo(tx);

    const planData = items.map((item) => ({
      vesselCode: item.vesselCode, material: item.material.trim().toUpperCase(),
      thickness: item.thickness,  width: item.width, length: item.length,
      memo: item.memo ?? null,    sourceFile: item.sourceFile ?? null,
      uploadBatchNo,
    }));
    const created = await tx.steelPlan.createMany({ data: planData });

    const heatData = items
      .filter((item) => item.heatNo?.trim())
      .map((item) => ({
        vesselCode: item.vesselCode, material: item.material.trim().toUpperCase(),
        thickness: item.thickness,  width: item.width, length: item.length,
        heatNo: item.heatNo!.trim().toUpperCase(), sourceFile: item.sourceFile ?? null,  // N22: 저장 시 대문자 정규화
        uploadBatchNo,
      }));
    if (heatData.length > 0) await tx.steelPlanHeat.createMany({ data: heatData });

    return { uploadBatchNo, count: created.count };
  });

  // ── 신규 등록 spec 별 DrawingList 자동 동기화 (트랜잭션 외부) ──────────
  // CAUTION 으로 떠있던 도면이 새 강재 등록으로 REGISTERED 로 자동 승격되어야 함
  await syncDrawingListBySpecs(items.map((item) => ({
    vesselCode: item.vesselCode, material: item.material.trim().toUpperCase(),
    thickness:  item.thickness,  width: item.width, length: item.length,
  })));

  return NextResponse.json({ count, uploadBatchNo }, { status: 201 });
}

// DELETE /api/steel-plan
// body: { ids: string[] }     → 선택 ID 일괄 삭제
// body: { vesselCode }        → 호선 전체 삭제
// body: { uploadBatchNo }     → 배치 단위 삭제
export async function DELETE(req: NextRequest) {
  const body = await req.json();

  // ── 삭제 대상 결정 (ids | uploadBatchNo | vesselCode) ──────────────────────
  let where: Prisma.SteelPlanWhereInput;
  let deleteHeatWhere: Prisma.SteelPlanHeatWhereInput | null = null; // ids 삭제는 판번호 미삭제(기존 동작 유지)
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    where = { id: { in: body.ids } };
  } else if (body.uploadBatchNo) {
    where = { uploadBatchNo: body.uploadBatchNo };
    deleteHeatWhere = { uploadBatchNo: body.uploadBatchNo };
  } else if (body.vesselCode) {
    where = { vesselCode: body.vesselCode };
    deleteHeatWhere = { vesselCode: body.vesselCode };
  } else {
    return NextResponse.json({ error: "ids 또는 uploadBatchNo 또는 vesselCode 필요" }, { status: 400 });
  }

  const targets = await prisma.steelPlan.findMany({
    where,
    select: { id: true, status: true, vesselCode: true, material: true, thickness: true, width: true, length: true },
  });
  if (targets.length === 0) return NextResponse.json({ planCount: 0, heatCount: 0 });
  const ids = targets.map((t) => t.id);

  // ① 절단완료 강재 포함 시 차단 — 작업일보에서 절단취소 먼저
  const completed = targets.filter((t) => t.status === "COMPLETED").length;
  if (completed > 0) {
    return NextResponse.json(
      { error: `절단완료된 강재 ${completed}건이 포함되어 있습니다. 작업일보에서 절단취소 후 다시 시도하세요.` },
      { status: 409 }
    );
  }

  // ② 외부출고 참조 처리 — 활성(ACTIVE) 출고장이 참조 중이면 차단, 취소(CANCELLED) 출고장 참조는 정리 후 삭제 허용.
  //    (출고장을 취소해도 ShipmentItem 이력이 강재를 Restrict FK 로 붙들어 삭제가 영영 막히던 문제 해결)
  const refItems = await prisma.shipmentItem.findMany({
    where: { steelPlanId: { in: ids } },
    select: { id: true, vehicle: { select: { shipment: { select: { status: true, shipmentNo: true } } } } },
  });
  const activeRefs = refItems.filter((it) => it.vehicle?.shipment?.status === "ACTIVE");
  if (activeRefs.length > 0) {
    const nos = [...new Set(activeRefs.map((a) => a.vehicle?.shipment?.shipmentNo).filter(Boolean))];
    return NextResponse.json(
      { error: `외부출고된 강재 ${activeRefs.length}건이 포함되어 있습니다(출고장 ${nos.join(", ")}). 출고 취소 후 다시 시도하세요.` },
      { status: 409 }
    );
  }
  const staleRefIds = refItems.map((it) => it.id); // 활성 없음 확인됨 → 나머지는 취소 출고 참조

  const affected = targets.map(({ vesselCode, material, thickness, width, length }) => ({ vesselCode, material, thickness, width, length }));

  const result = await prisma.$transaction(async (tx) => {
    if (staleRefIds.length) await tx.shipmentItem.updateMany({ where: { id: { in: staleRefIds } }, data: { steelPlanId: null } });
    const plan = await tx.steelPlan.deleteMany({ where: { id: { in: ids } } });
    let heatCount = 0;
    if (deleteHeatWhere) heatCount = (await tx.steelPlanHeat.deleteMany({ where: deleteHeatWhere })).count;
    return { planCount: plan.count, heatCount };
  });
  await syncDrawingListBySpecs(affected);
  return NextResponse.json(result);
}
