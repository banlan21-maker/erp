export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TYPE_LABEL: Record<string, string>   = { REMNANT: "현장잔재", SURPLUS: "여유원재", REGISTERED: "등록잔재" };
const SHAPE_LABEL: Record<string, string>  = { RECTANGLE: "사각형", L_SHAPE: "L자형", IRREGULAR: "불규칙형" };
const STATUS_LABEL: Record<string, string> = { IN_STOCK: "재고", EXHAUSTED: "소진" };

// GET /api/remnants/distinct?type=REGISTERED
export async function GET(request: NextRequest) {
  const typeFilter = new URL(request.url).searchParams.get("type") || undefined;
  const base = typeFilter ? { type: typeFilter as "REMNANT" | "SURPLUS" | "REGISTERED" } : {};

  const [
    types, shapes, materials, thicknesses,
    widths1, lengths1, widths2, lengths2, weights,
    statuses, locations, heatNos, sourceBlocks,
    projectSources, vesselSources,
  ] = await Promise.all([
    prisma.remnant.findMany({ where: base, select: { type: true },      distinct: ["type"],      orderBy: { type: "asc" } }),
    prisma.remnant.findMany({ where: base, select: { shape: true },     distinct: ["shape"],     orderBy: { shape: "asc" } }),
    prisma.remnant.findMany({ where: base, select: { material: true },  distinct: ["material"],  orderBy: { material: "asc" } }),
    prisma.remnant.findMany({ where: base, select: { thickness: true }, distinct: ["thickness"], orderBy: { thickness: "asc" } }),
    prisma.remnant.findMany({ where: { ...base, width1:  { not: null } }, select: { width1:  true }, distinct: ["width1"],  orderBy: { width1:  "asc" } }),
    prisma.remnant.findMany({ where: { ...base, length1: { not: null } }, select: { length1: true }, distinct: ["length1"], orderBy: { length1: "asc" } }),
    prisma.remnant.findMany({ where: { ...base, width2:  { not: null } }, select: { width2:  true }, distinct: ["width2"],  orderBy: { width2:  "asc" } }),
    prisma.remnant.findMany({ where: { ...base, length2: { not: null } }, select: { length2: true }, distinct: ["length2"], orderBy: { length2: "asc" } }),
    prisma.remnant.findMany({ where: base, select: { weight: true },    distinct: ["weight"],    orderBy: { weight: "asc" } }),
    prisma.remnant.findMany({ where: base, select: { status: true },    distinct: ["status"],    orderBy: { status: "asc" } }),
    prisma.remnant.findMany({ where: base, select: { location: true },  distinct: ["location"],  orderBy: { location: "asc" } }),
    prisma.remnant.findMany({ where: { ...base, heatNo:      { not: null } }, select: { heatNo:      true }, distinct: ["heatNo"],      orderBy: { heatNo:      "asc" } }),
    prisma.remnant.findMany({ where: { ...base, sourceBlock: { not: null } }, select: { sourceBlock: true }, distinct: ["sourceBlock"], orderBy: { sourceBlock: "asc" } }),
    prisma.remnant.findMany({
      where:    { ...base, sourceProjectId: { not: null } },
      select:   { sourceProject: { select: { projectCode: true, projectName: true } } },
      distinct: ["sourceProjectId"],
      orderBy:  { sourceProjectId: "asc" },
    }),
    prisma.remnant.findMany({
      where:    { ...base, sourceVesselName: { not: null }, sourceProjectId: null },
      select:   { sourceVesselName: true },
      distinct: ["sourceVesselName"],
      orderBy:  { sourceVesselName: "asc" },
    }),
  ]);

  return NextResponse.json({
    type:     types.map(t => ({ value: t.type,     label: TYPE_LABEL[t.type]   ?? t.type })),
    shape:    shapes.map(s => ({ value: s.shape,   label: SHAPE_LABEL[s.shape] ?? s.shape })),
    material: materials.map(m => ({ value: m.material, label: m.material })),
    thickness: thicknesses.map(t => ({ value: String(t.thickness), label: String(parseFloat(t.thickness.toFixed(1))) })),

    width1:  [{ value: "__NULL__", label: "(항목없음)" }, ...widths1.map(r  => ({ value: String(r.width1),  label: String(Math.round(r.width1!)) }))],
    length1: [{ value: "__NULL__", label: "(항목없음)" }, ...lengths1.map(r => ({ value: String(r.length1), label: String(Math.round(r.length1!)) }))],
    width2:  [{ value: "__NULL__", label: "(항목없음)" }, ...widths2.map(r  => ({ value: String(r.width2),  label: String(Math.round(r.width2!)) }))],
    length2: [{ value: "__NULL__", label: "(항목없음)" }, ...lengths2.map(r => ({ value: String(r.length2), label: String(Math.round(r.length2!)) }))],
    weight:  weights.map(w => ({ value: String(w.weight), label: String(parseFloat(w.weight.toFixed(1))) })),

    status:   statuses.map(s => ({ value: s.status, label: STATUS_LABEL[s.status] ?? s.status })),
    location: [
      { value: "__NULL__", label: "(미지정)" },
      ...locations.filter(l => l.location != null).map(l => ({ value: l.location!, label: l.location! })),
    ],
    heatNo: [
      { value: "__NULL__", label: "(없음)" },
      ...heatNos.map(h => ({ value: h.heatNo!, label: h.heatNo! })),
    ],
    sourceBlock: [
      { value: "__NULL__", label: "(없음)" },
      ...sourceBlocks.map(b => ({ value: b.sourceBlock!, label: b.sourceBlock! })),
    ],
    // P:코드 = 프로젝트 연결, V:이름 = 직접 입력
    source: [
      { value: "__NULL__", label: "(출처없음)" },
      ...projectSources
        .filter(r => r.sourceProject != null)
        .map(r => ({ value: `P:${r.sourceProject!.projectCode}`, label: `[${r.sourceProject!.projectCode}] ${r.sourceProject!.projectName}` })),
      ...vesselSources
        .filter(r => r.sourceVesselName != null)
        .map(r => ({ value: `V:${r.sourceVesselName!}`, label: r.sourceVesselName! })),
    ],
  });
}
