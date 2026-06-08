export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseList, buildCascadingWhere, nullableInBuilder } from "@/lib/server-cascading";

const HEAT_STATUS_LABEL: Record<string, string> = {
  WAITING: "대기",
  CUT:     "절단",
};

const QS_KEY: Record<string, string> = {
  vesselCode:    "vesselCodes",
  material:      "materials",
  thickness:     "thicknesses",
  width:         "widths",
  length:        "lengths",
  heatNo:        "heatNos",
  status:        "statuses",
  uploadBatchNo: "uploadBatchNos",
};

const BUILDERS: Record<string, (vs: string[]) => Record<string, unknown>> = {
  vesselCode:    vs => ({ vesselCode: { in: vs } }),
  material:      vs => ({ material:   { in: vs } }),
  thickness:     vs => ({ thickness:  { in: vs.map(Number) } }),
  width:         vs => ({ width:      { in: vs.map(Number) } }),
  length:        vs => ({ length:     { in: vs.map(Number) } }),
  heatNo:        vs => ({ heatNo:     { in: vs } }),
  status:        vs => ({ status:     { in: vs } }),
  uploadBatchNo: nullableInBuilder("uploadBatchNo"),
};

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const filters: Record<string, string[]> = {};
  for (const [colKey, qsKey] of Object.entries(QS_KEY)) {
    filters[colKey] = parseList(sp.get(qsKey));
  }

  const where = (excludeKey: string) => buildCascadingWhere(BUILDERS, filters, excludeKey);

  const [vessels, materials, thicknesses, widths, lengths, heatNos, statuses, batchNos] =
    await Promise.all([
      prisma.steelPlanHeat.findMany({ where: where("vesselCode"),    select: { vesselCode: true },    distinct: ["vesselCode"],    orderBy: { vesselCode: "asc" } }),
      prisma.steelPlanHeat.findMany({ where: where("material"),      select: { material: true },      distinct: ["material"],      orderBy: { material: "asc" } }),
      prisma.steelPlanHeat.findMany({ where: where("thickness"),     select: { thickness: true },     distinct: ["thickness"],     orderBy: { thickness: "asc" } }),
      prisma.steelPlanHeat.findMany({ where: where("width"),         select: { width: true },         distinct: ["width"],         orderBy: { width: "asc" } }),
      prisma.steelPlanHeat.findMany({ where: where("length"),        select: { length: true },        distinct: ["length"],        orderBy: { length: "asc" } }),
      prisma.steelPlanHeat.findMany({ where: where("heatNo"),        select: { heatNo: true },        distinct: ["heatNo"],        orderBy: { heatNo: "asc" } }),
      prisma.steelPlanHeat.findMany({ where: where("status"),        select: { status: true },        distinct: ["status"],        orderBy: { status: "asc" } }),
      prisma.steelPlanHeat.findMany({ where: where("uploadBatchNo"), select: { uploadBatchNo: true }, distinct: ["uploadBatchNo"], orderBy: { uploadBatchNo: "asc" } }),
    ]);

  return NextResponse.json({
    vesselCode:    vessels.map((v) => ({ value: v.vesselCode, label: v.vesselCode })),
    material:      materials.map((m) => ({ value: m.material, label: m.material })),
    thickness:     thicknesses.map((t) => ({ value: String(t.thickness), label: `${t.thickness}mm` })),
    width:         widths.map((w) => ({ value: String(w.width),   label: `${w.width}mm` })),
    length:        lengths.map((l) => ({ value: String(l.length), label: `${l.length}mm` })),
    heatNo:        heatNos.map((h) => ({ value: h.heatNo, label: h.heatNo })),
    status:        statuses.map((s) => ({ value: s.status, label: HEAT_STATUS_LABEL[s.status] ?? s.status })),
    uploadBatchNo: [
      { value: "__NULL__", label: "(없음)" },
      ...batchNos
        .filter((b) => b.uploadBatchNo !== null)
        .map((b) => ({ value: b.uploadBatchNo!, label: b.uploadBatchNo! })),
    ],
  });
}
