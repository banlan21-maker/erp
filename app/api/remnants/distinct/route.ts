export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseList, buildCascadingWhere, nullableInBuilder } from "@/lib/server-cascading";

const TYPE_LABEL: Record<string, string>   = { REMNANT: "현장잔재", SURPLUS: "여유원재", REGISTERED: "등록잔재" };
const SHAPE_LABEL: Record<string, string>  = { RECTANGLE: "사각형", L_SHAPE: "L자형", IRREGULAR: "불규칙형" };
const STATUS_LABEL: Record<string, string> = { IN_STOCK: "재고", EXHAUSTED: "소진" };

// 컬럼 key → 쿼리스트링 파라미터 이름
const QS_KEY: Record<string, string> = {
  shape:       "shapes",
  material:    "materials",
  thickness:   "thicknesses",
  width1:      "width1s",
  length1:     "length1s",
  width2:      "width2s",
  length2:     "length2s",
  weight:      "weights",
  status:      "statuses",
  location:    "locations",
  heatNo:      "heatNos",
  sourceBlock: "sourceBlocks",
  source:      "sources",
};

// P:projectCode / V:vesselName / __NULL__ 의 3-mode 빌더
const sourceBuilder = (vs: string[]): Record<string, unknown> => {
  const hasNull       = vs.includes("__NULL__");
  const projectCodes  = vs.filter(v => v.startsWith("P:")).map(v => v.slice(2));
  const vesselNames   = vs.filter(v => v.startsWith("V:")).map(v => v.slice(2));

  const ors: Record<string, unknown>[] = [];
  if (hasNull)               ors.push({ AND: [{ sourceProjectId: null }, { sourceVesselName: null }] });
  if (projectCodes.length)   ors.push({ sourceProject: { projectCode: { in: projectCodes } } });
  if (vesselNames.length)    ors.push({ sourceVesselName: { in: vesselNames }, sourceProjectId: null });

  if (ors.length === 0) return {};
  if (ors.length === 1) return ors[0];
  return { OR: ors };
};

const BUILDERS: Record<string, (vs: string[]) => Record<string, unknown>> = {
  shape:       vs => ({ shape:     { in: vs } }),
  material:    vs => ({ material:  { in: vs } }),
  thickness:   vs => ({ thickness: { in: vs.map(Number) } }),
  width1:      nullableInBuilder("width1"),
  length1:     nullableInBuilder("length1"),
  width2:      nullableInBuilder("width2"),
  length2:     nullableInBuilder("length2"),
  weight:      vs => ({ weight:    { in: vs.map(Number) } }),
  status:      vs => ({ status:    { in: vs } }),
  location:    nullableInBuilder("location"),
  heatNo:      nullableInBuilder("heatNo"),
  sourceBlock: nullableInBuilder("sourceBlock"),
  source:      sourceBuilder,
};

// width1/length1/width2/length2: nullableInBuilder는 string in 으로 만들어서
// 숫자 컬럼엔 직접 못 씀 — 위 BUILDERS 항목은 아래에서 override.
BUILDERS.width1  = vs => buildNumberOrNull("width1",  vs);
BUILDERS.length1 = vs => buildNumberOrNull("length1", vs);
BUILDERS.width2  = vs => buildNumberOrNull("width2",  vs);
BUILDERS.length2 = vs => buildNumberOrNull("length2", vs);

function buildNumberOrNull(field: string, vs: string[]): Record<string, unknown> {
  const hasNull = vs.includes("__NULL__");
  const nums = vs.filter(x => x !== "__NULL__").map(Number);
  if (hasNull && nums.length === 0) return { [field]: null };
  if (hasNull) return { OR: [{ [field]: null }, { [field]: { in: nums } }] };
  return { [field]: { in: nums } };
}

// GET /api/remnants/distinct?type=REGISTERED&materials=AH36&...
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;

  const typeFilter = sp.get("type") || undefined;
  const base = typeFilter ? { type: typeFilter as "REMNANT" | "SURPLUS" | "REGISTERED" } : {};

  // cascading filters
  const filters: Record<string, string[]> = {};
  for (const [colKey, qsKey] of Object.entries(QS_KEY)) {
    filters[colKey] = parseList(sp.get(qsKey));
  }

  // base(type) + cascading(타 컬럼) — 자기 자신 제외
  const where = (excludeKey: string) => ({
    ...base,
    ...buildCascadingWhere(BUILDERS, filters, excludeKey),
  });

  const [
    types, shapes, materials, thicknesses,
    widths1, lengths1, widths2, lengths2, weights,
    statuses, locations, heatNos, sourceBlocks,
    projectSources, vesselSources,
    nullW1, nullL1, nullW2, nullL2, nullLoc, nullHeat, nullBlock, nullSource,
  ] = await Promise.all([
    prisma.remnant.findMany({ where: where(""),            select: { type: true },      distinct: ["type"],      orderBy: { type: "asc" } }),
    prisma.remnant.findMany({ where: where("shape"),       select: { shape: true },     distinct: ["shape"],     orderBy: { shape: "asc" } }),
    prisma.remnant.findMany({ where: where("material"),    select: { material: true },  distinct: ["material"],  orderBy: { material: "asc" } }),
    prisma.remnant.findMany({ where: where("thickness"),   select: { thickness: true }, distinct: ["thickness"], orderBy: { thickness: "asc" } }),
    prisma.remnant.findMany({ where: { ...where("width1"),  width1:  { not: null } }, select: { width1:  true }, distinct: ["width1"],  orderBy: { width1:  "asc" } }),
    prisma.remnant.findMany({ where: { ...where("length1"), length1: { not: null } }, select: { length1: true }, distinct: ["length1"], orderBy: { length1: "asc" } }),
    prisma.remnant.findMany({ where: { ...where("width2"),  width2:  { not: null } }, select: { width2:  true }, distinct: ["width2"],  orderBy: { width2:  "asc" } }),
    prisma.remnant.findMany({ where: { ...where("length2"), length2: { not: null } }, select: { length2: true }, distinct: ["length2"], orderBy: { length2: "asc" } }),
    prisma.remnant.findMany({ where: where("weight"),      select: { weight: true },    distinct: ["weight"],    orderBy: { weight: "asc" } }),
    prisma.remnant.findMany({ where: where("status"),      select: { status: true },    distinct: ["status"],    orderBy: { status: "asc" } }),
    prisma.remnant.findMany({ where: { ...where("location"),    location:    { not: null } }, select: { location:    true }, distinct: ["location"],    orderBy: { location:    "asc" } }),
    prisma.remnant.findMany({ where: { ...where("heatNo"),      heatNo:      { not: null } }, select: { heatNo:      true }, distinct: ["heatNo"],      orderBy: { heatNo:      "asc" } }),
    prisma.remnant.findMany({ where: { ...where("sourceBlock"), sourceBlock: { not: null } }, select: { sourceBlock: true }, distinct: ["sourceBlock"], orderBy: { sourceBlock: "asc" } }),
    prisma.remnant.findMany({
      where:    { ...where("source"), sourceProjectId: { not: null } },
      select:   { sourceProject: { select: { projectCode: true, projectName: true } } },
      distinct: ["sourceProjectId"],
    }),
    prisma.remnant.findMany({
      where:    { ...where("source"), sourceVesselName: { not: null }, sourceProjectId: null },
      select:   { sourceVesselName: true },
      distinct: ["sourceVesselName"],
      orderBy:  { sourceVesselName: "asc" },
    }),
    prisma.remnant.count({ where: { ...where("width1"),      width1:  null } }),
    prisma.remnant.count({ where: { ...where("length1"),     length1: null } }),
    prisma.remnant.count({ where: { ...where("width2"),      width2:  null } }),
    prisma.remnant.count({ where: { ...where("length2"),     length2: null } }),
    prisma.remnant.count({ where: { ...where("location"),    location: null } }),
    prisma.remnant.count({ where: { ...where("heatNo"),      heatNo:   null } }),
    prisma.remnant.count({ where: { ...where("sourceBlock"), sourceBlock: null } }),
    prisma.remnant.count({ where: { ...where("source"),      sourceProjectId: null, sourceVesselName: null } }),
  ]);

  const sortedProjects = [...projectSources]
    .filter(r => r.sourceProject != null)
    .sort((a, b) => (a.sourceProject!.projectCode).localeCompare(b.sourceProject!.projectCode));

  const withNullOption = (count: number, label: string, items: { value: string; label: string }[]) =>
    count > 0 ? [{ value: "__NULL__", label }, ...items] : items;

  const sourceItems: { value: string; label: string }[] = [
    ...sortedProjects.map(r => ({
      value: `P:${r.sourceProject!.projectCode}`,
      label: `[${r.sourceProject!.projectCode}] ${r.sourceProject!.projectName}`,
    })),
    ...vesselSources
      .filter(r => r.sourceVesselName != null)
      .map(r => ({ value: `V:${r.sourceVesselName!}`, label: r.sourceVesselName! })),
  ];

  return NextResponse.json({
    type:     types.map(t => ({ value: t.type,     label: TYPE_LABEL[t.type]   ?? t.type })),
    shape:    shapes.map(s => ({ value: s.shape,   label: SHAPE_LABEL[s.shape] ?? s.shape })),
    material: materials.map(m => ({ value: m.material, label: m.material })),
    thickness: thicknesses.map(t => ({ value: String(t.thickness), label: String(parseFloat(t.thickness.toFixed(1))) })),

    width1:  withNullOption(nullW1, "(항목없음)", widths1.map(r  => ({ value: String(r.width1),  label: String(Math.round(r.width1!)) }))),
    length1: withNullOption(nullL1, "(항목없음)", lengths1.map(r => ({ value: String(r.length1), label: String(Math.round(r.length1!)) }))),
    width2:  withNullOption(nullW2, "(항목없음)", widths2.map(r  => ({ value: String(r.width2),  label: String(Math.round(r.width2!)) }))),
    length2: withNullOption(nullL2, "(항목없음)", lengths2.map(r => ({ value: String(r.length2), label: String(Math.round(r.length2!)) }))),
    weight:  weights.map(w => ({ value: String(w.weight), label: String(parseFloat(w.weight.toFixed(1))) })),

    status:   statuses.map(s => ({ value: s.status, label: STATUS_LABEL[s.status] ?? s.status })),
    location: withNullOption(nullLoc, "(미지정)",
      locations.map(l => ({ value: l.location!, label: l.location! })),
    ),
    heatNo: withNullOption(nullHeat, "(없음)",
      heatNos.map(h => ({ value: h.heatNo!, label: h.heatNo! })),
    ),
    sourceBlock: withNullOption(nullBlock, "(없음)",
      sourceBlocks.map(b => ({ value: b.sourceBlock!, label: b.sourceBlock! })),
    ),
    source: withNullOption(nullSource, "(출처없음)", sourceItems),
  });
}
