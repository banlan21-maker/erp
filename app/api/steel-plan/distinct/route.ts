export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL: Record<string, string> = {
  REGISTERED: "등록",
  RECEIVED:   "입고완료",
  COMPLETED:  "절단완료",
};

export async function GET() {
  const [vessels, materials, thicknesses, widths, lengths, statuses, locations, reservedFors, allDates, heatNos, actualVessels, drawingNos] =
    await Promise.all([
      prisma.steelPlan.findMany({ select: { vesselCode: true },       distinct: ["vesselCode"],       orderBy: { vesselCode: "asc" } }),
      prisma.steelPlan.findMany({ select: { material: true },         distinct: ["material"],         orderBy: { material: "asc" } }),
      prisma.steelPlan.findMany({ select: { thickness: true },        distinct: ["thickness"],        orderBy: { thickness: "asc" } }),
      prisma.steelPlan.findMany({ select: { width: true },            distinct: ["width"],            orderBy: { width: "asc" } }),
      prisma.steelPlan.findMany({ select: { length: true },           distinct: ["length"],           orderBy: { length: "asc" } }),
      prisma.steelPlan.findMany({ select: { status: true },           distinct: ["status"],           orderBy: { status: "asc" } }),
      prisma.steelPlan.findMany({ select: { storageLocation: true },  distinct: ["storageLocation"],  orderBy: { storageLocation: "asc" } }),
      prisma.steelPlan.findMany({ select: { reservedFor: true },      distinct: ["reservedFor"],      orderBy: { reservedFor: "asc" } }),
      prisma.steelPlan.findMany({
        select:  { receivedAt: true },
        where:   { receivedAt: { not: null } },
        orderBy: { receivedAt: "asc" },
      }),
      prisma.steelPlan.findMany({ select: { actualHeatNo: true },     distinct: ["actualHeatNo"],     where: { actualHeatNo:     { not: null } }, orderBy: { actualHeatNo:     "asc" } }),
      prisma.steelPlan.findMany({ select: { actualVesselCode: true }, distinct: ["actualVesselCode"], where: { actualVesselCode: { not: null } }, orderBy: { actualVesselCode: "asc" } }),
      prisma.steelPlan.findMany({ select: { actualDrawingNo: true },  distinct: ["actualDrawingNo"],  where: { actualDrawingNo:  { not: null } }, orderBy: { actualDrawingNo:  "asc" } }),
    ]);

  // receivedAt: group by date (YYYY-MM-DD) and deduplicate
  const uniqueDates = [
    ...new Set(allDates.map((d) => d.receivedAt!.toISOString().split("T")[0])),
  ].sort();

  return NextResponse.json({
    vesselCode: vessels.map((v) => ({ value: v.vesselCode, label: v.vesselCode })),

    material: materials.map((m) => ({ value: m.material, label: m.material })),

    thickness: thicknesses.map((t) => ({ value: String(t.thickness), label: String(t.thickness) })),

    width: widths.map((w) => ({ value: String(w.width), label: String(w.width) })),

    length: lengths.map((l) => ({ value: String(l.length), label: String(l.length) })),

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
