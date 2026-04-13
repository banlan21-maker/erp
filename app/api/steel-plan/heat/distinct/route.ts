export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HEAT_STATUS_LABEL: Record<string, string> = {
  WAITING: "대기",
  CUT:     "절단",
};

export async function GET() {
  const [vessels, materials, thicknesses, widths, lengths, heatNos, statuses] =
    await Promise.all([
      prisma.steelPlanHeat.findMany({ select: { vesselCode: true }, distinct: ["vesselCode"], orderBy: { vesselCode: "asc" } }),
      prisma.steelPlanHeat.findMany({ select: { material: true },   distinct: ["material"],   orderBy: { material: "asc" } }),
      prisma.steelPlanHeat.findMany({ select: { thickness: true },  distinct: ["thickness"],  orderBy: { thickness: "asc" } }),
      prisma.steelPlanHeat.findMany({ select: { width: true },      distinct: ["width"],      orderBy: { width: "asc" } }),
      prisma.steelPlanHeat.findMany({ select: { length: true },     distinct: ["length"],     orderBy: { length: "asc" } }),
      prisma.steelPlanHeat.findMany({ select: { heatNo: true },     distinct: ["heatNo"],     orderBy: { heatNo: "asc" } }),
      prisma.steelPlanHeat.findMany({ select: { status: true },     distinct: ["status"],     orderBy: { status: "asc" } }),
    ]);

  return NextResponse.json({
    vesselCode: vessels.map((v) => ({ value: v.vesselCode, label: v.vesselCode })),
    material:   materials.map((m) => ({ value: m.material,  label: m.material })),
    thickness:  thicknesses.map((t) => ({ value: String(t.thickness), label: `${t.thickness}mm` })),
    width:      widths.map((w) => ({ value: String(w.width),     label: `${w.width}mm` })),
    length:     lengths.map((l) => ({ value: String(l.length),   label: `${l.length}mm` })),
    heatNo:     heatNos.map((h) => ({ value: h.heatNo, label: h.heatNo })),
    status:     statuses.map((s) => ({ value: s.status, label: HEAT_STATUS_LABEL[s.status] ?? s.status })),
  });
}
