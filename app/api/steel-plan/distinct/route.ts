export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseList, buildCascadingWhere, nullableInBuilder, dateRangeBuilder } from "@/lib/server-cascading";

const STATUS_LABEL: Record<string, string> = {
  REGISTERED:  "등록",
  RECEIVED:    "입고",
  ISSUED:      "투입",
  COMPLETED:   "절단",
  SHIPPED_OUT: "외부",
};

// 컬럼 key → 쿼리스트링 파라미터 이름
const QS_KEY: Record<string, string> = {
  vesselCode:         "vesselCodes",
  material:           "materials",
  thickness:          "thicknesses",
  width:              "widths",
  length:             "lengths",
  status:             "statuses",
  storageLocation:    "storageLocations",
  reservedFor:        "reservedFors",
  receivedAt:         "receivedDates",
  uploadBatchNo:      "uploadBatchNos",
  selectionPrintedAt: "selectionPrintedDates",
  issuedAt:           "issuedDates",
  actualHeatNo:       "actualHeatNos",
  actualVesselCode:   "actualVesselCodes",
  actualDrawingNo:    "actualDrawingNos",
};

// 컬럼별 Prisma WHERE 조각 빌더 — cascading where 절 구성용
const BUILDERS: Record<string, (vs: string[]) => Record<string, unknown>> = {
  vesselCode:         vs => ({ vesselCode: { in: vs } }),
  material:           vs => ({ material:   { in: vs } }),
  thickness:          vs => ({ thickness:  { in: vs.map(Number) } }),
  width:              vs => ({ width:      { in: vs.map(Number) } }),
  length:             vs => ({ length:     { in: vs.map(Number) } }),
  status:             vs => ({ status:     { in: vs } }),
  storageLocation:    nullableInBuilder("storageLocation"),
  reservedFor:        nullableInBuilder("reservedFor"),
  receivedAt:         dateRangeBuilder("receivedAt"),
  uploadBatchNo:      nullableInBuilder("uploadBatchNo"),
  selectionPrintedAt: dateRangeBuilder("selectionPrintedAt"),
  issuedAt:           dateRangeBuilder("issuedAt"),
  actualHeatNo:       nullableInBuilder("actualHeatNo"),
  actualVesselCode:   nullableInBuilder("actualVesselCode"),
  actualDrawingNo:    nullableInBuilder("actualDrawingNo"),
};

const toUniqueDates = (rows: { toISOString: () => string }[]) =>
  [...new Set(rows.map((d) => d.toISOString().split("T")[0]))].sort();

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  // 1) 쿼리스트링 → filters
  const filters: Record<string, string[]> = {};
  for (const [colKey, qsKey] of Object.entries(QS_KEY)) {
    filters[colKey] = parseList(sp.get(qsKey));
  }

  // search 파라미터 (본 데이터 fetch 와 동일 조건) — 검색어 활성 시 distinct 결과도 그 범위 안으로 좁힘
  const search = sp.get("search") || undefined;
  const searchWhere = search
    ? {
        OR: [
          { vesselCode: { contains: search, mode: "insensitive" as const } },
          { material:   { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  // 2) cascading where 빌더 — 자기 자신 컬럼 제외 + search 조건 추가
  const where = (excludeKey: string) => ({
    ...searchWhere,
    ...buildCascadingWhere(BUILDERS, filters, excludeKey),
  });

  // 3) 15개 distinct 쿼리 병렬
  const [
    vessels, materials, thicknesses, widths, lengths, statuses,
    locations, reservedFors, allDates, heatNos, actualVessels, drawingNos,
    batchNos, allSelectionDates, allIssuedDates,
  ] = await Promise.all([
    prisma.steelPlan.findMany({ where: where("vesselCode"),         select: { vesselCode: true },       distinct: ["vesselCode"],         orderBy: { vesselCode: "asc" } }),
    prisma.steelPlan.findMany({ where: where("material"),           select: { material: true },         distinct: ["material"],           orderBy: { material: "asc" } }),
    prisma.steelPlan.findMany({ where: where("thickness"),          select: { thickness: true },        distinct: ["thickness"],          orderBy: { thickness: "asc" } }),
    prisma.steelPlan.findMany({ where: where("width"),              select: { width: true },            distinct: ["width"],              orderBy: { width: "asc" } }),
    prisma.steelPlan.findMany({ where: where("length"),             select: { length: true },           distinct: ["length"],             orderBy: { length: "asc" } }),
    prisma.steelPlan.findMany({ where: where("status"),             select: { status: true },           distinct: ["status"],             orderBy: { status: "asc" } }),
    prisma.steelPlan.findMany({ where: where("storageLocation"),    select: { storageLocation: true },  distinct: ["storageLocation"],    orderBy: { storageLocation: "asc" } }),
    prisma.steelPlan.findMany({ where: where("reservedFor"),        select: { reservedFor: true },      distinct: ["reservedFor"],        orderBy: { reservedFor: "asc" } }),
    prisma.steelPlan.findMany({
      where:   { ...where("receivedAt"), receivedAt: { not: null } },
      select:  { receivedAt: true },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.steelPlan.findMany({ where: { ...where("actualHeatNo"),     actualHeatNo:     { not: null } }, select: { actualHeatNo: true },     distinct: ["actualHeatNo"],     orderBy: { actualHeatNo:     "asc" } }),
    prisma.steelPlan.findMany({ where: { ...where("actualVesselCode"), actualVesselCode: { not: null } }, select: { actualVesselCode: true }, distinct: ["actualVesselCode"], orderBy: { actualVesselCode: "asc" } }),
    prisma.steelPlan.findMany({ where: { ...where("actualDrawingNo"),  actualDrawingNo:  { not: null } }, select: { actualDrawingNo: true },  distinct: ["actualDrawingNo"],  orderBy: { actualDrawingNo:  "asc" } }),
    prisma.steelPlan.findMany({ where: where("uploadBatchNo"),      select: { uploadBatchNo: true },    distinct: ["uploadBatchNo"],      orderBy: { uploadBatchNo: "asc" } }),
    prisma.steelPlan.findMany({ where: { ...where("selectionPrintedAt"), selectionPrintedAt: { not: null } }, select: { selectionPrintedAt: true }, orderBy: { selectionPrintedAt: "asc" } }),
    prisma.steelPlan.findMany({ where: { ...where("issuedAt"),           issuedAt:           { not: null } }, select: { issuedAt: true },           orderBy: { issuedAt:           "asc" } }),
  ]);

  const uniqueDates          = toUniqueDates(allDates.map((d)  => d.receivedAt!));
  const uniqueSelectionDates = toUniqueDates(allSelectionDates.map((d) => d.selectionPrintedAt!));
  const uniqueIssuedDates    = toUniqueDates(allIssuedDates.map((d) => d.issuedAt!));

  return NextResponse.json({
    vesselCode: vessels.map((v) => ({ value: v.vesselCode, label: v.vesselCode })),

    material: materials.map((m) => ({ value: m.material, label: m.material })),

    thickness: thicknesses.map((t) => ({ value: String(t.thickness), label: String(parseFloat(t.thickness.toFixed(1))) })),

    width: widths.map((w) => ({ value: String(w.width), label: String(Math.round(w.width)) })),

    length: lengths.map((l) => ({ value: String(l.length), label: String(Math.round(l.length)) })),

    status: statuses.map((s) => ({ value: s.status, label: STATUS_LABEL[s.status] ?? s.status })),

    storageLocation: [
      { value: "__NULL__", label: "(미지정)" },
      ...locations
        .filter((l) => l.storageLocation !== null)
        .map((l) => ({ value: l.storageLocation!, label: l.storageLocation! })),
    ],

    reservedFor: [
      { value: "__NULL__", label: "(미확정)" },
      ...reservedFors
        .filter((r) => r.reservedFor !== null)
        .map((r) => ({ value: r.reservedFor!, label: `${r.reservedFor} 확정` })),
    ],

    receivedAt: [
      { value: "__NULL__", label: "미입고" },
      ...uniqueDates.map((d) => ({ value: d, label: d })),
    ],

    uploadBatchNo: [
      { value: "__NULL__", label: "(없음)" },
      ...batchNos
        .filter((b) => b.uploadBatchNo !== null)
        .map((b) => ({ value: b.uploadBatchNo!, label: b.uploadBatchNo! })),
    ],

    selectionPrintedAt: [
      { value: "__NULL__", label: "미출력" },
      ...uniqueSelectionDates.map((d) => ({ value: d, label: d })),
    ],

    issuedAt: [
      { value: "__NULL__", label: "미출고" },
      ...uniqueIssuedDates.map((d) => ({ value: d, label: d })),
    ],

    actualHeatNo: [
      { value: "__NULL__", label: "(없음)" },
      ...heatNos.map((r) => ({ value: r.actualHeatNo!, label: r.actualHeatNo! })),
    ],
    actualVesselCode: [
      { value: "__NULL__", label: "(없음)" },
      ...actualVessels.map((r) => ({ value: r.actualVesselCode!, label: r.actualVesselCode! })),
    ],
    actualDrawingNo: [
      { value: "__NULL__", label: "(없음)" },
      ...drawingNos.map((r) => ({ value: r.actualDrawingNo!, label: r.actualDrawingNo! })),
    ],
  });
}
