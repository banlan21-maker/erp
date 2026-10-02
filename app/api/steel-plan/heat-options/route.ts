export const dynamic = "force-dynamic";

// GET /api/steel-plan/heat-options?vesselCode=&material=&thickness=&width=&length=&q=&excludeActive=1
// 조건에 맞는 판번호(heatNo) 목록 반환 — SteelPlanHeat 테이블 조회

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vesselCode = searchParams.get("vesselCode") || undefined;
  const material   = searchParams.get("material")   || undefined;
  const thickness  = searchParams.get("thickness")  ? Number(searchParams.get("thickness"))  : undefined;
  const width      = searchParams.get("width")      ? Number(searchParams.get("width"))      : undefined;
  const length     = searchParams.get("length")     ? Number(searchParams.get("length"))     : undefined;
  const q          = searchParams.get("q")          || undefined;
  const excludeActive = searchParams.get("excludeActive") === "1";

  // 출고예정(출고등록으로 판번호 지정)된 판번호는 절단 선택지에서 제외 (절단↔출고 상호배제)
  // 동일 사양(+호선)으로 한정 — 동명 판번호가 다른 사양에서 오제외되지 않도록
  const markedPlans = await prisma.steelPlan.findMany({
    where: {
      shipoutMarkedAt: { not: null },
      shipoutHeatNo: { not: null },
      ...(vesselCode ? { vesselCode } : {}),
      ...(material   ? { material: { equals: material, mode: "insensitive" } } : {}),
      ...(thickness  ? { thickness } : {}),
      ...(width      ? { width }     : {}),
      ...(length     ? { length }    : {}),
    },
    select: { shipoutHeatNo: true },
  });
  const excludeHeatNos = [...new Set(markedPlans.map((p) => p.shipoutHeatNo!).filter(Boolean))];

  const rows = await prisma.steelPlanHeat.findMany({
    where: {
      ...(vesselCode ? { vesselCode } : {}),
      ...(material   ? { material: { equals: material, mode: "insensitive" } } : {}),
      ...(thickness  ? { thickness } : {}),
      ...(width      ? { width }     : {}),
      ...(length     ? { length }    : {}),
      status: "WAITING",
      ...(q ? { heatNo: { contains: q, mode: "insensitive" } } : {}),
      ...(excludeHeatNos.length ? { NOT: { heatNo: { in: excludeHeatNos } } } : {}),
    },
    select: { id: true, heatNo: true, vesselCode: true, material: true, thickness: true, width: true, length: true, status: true },
    orderBy: { heatNo: "asc" },
  });

  // excludeActive=1 (현장 작업일보) — 다른 장비가 지금 자르고 있는(STARTED) 판번호는 뺀다 (2026-10-02).
  //   같은 도면·같은 철판 여러 장을 여러 장비에서 동시에 자를 수 있게 되면서(진행중 가드 행 단위화),
  //   진행중 판번호가 WAITING 그대로 후보에 남아 고르면 착수 시 '남은 재고 없음' 409 로 막혔다.
  //   착수 가드(POST /api/cutting-logs 판번호 재사용 가드 B)와 같은 기준: 판번호별 STARTED 건수만큼 뺀다
  //   (수입재처럼 같은 판번호가 여러 장이면 남은 장은 그대로 보인다). 사무실 수정 화면은 자기 판번호가
  //   빠지면 안 되므로 기본은 끔.
  if (excludeActive && material && thickness && width && length && rows.length) {
    const active = await prisma.cuttingLog.findMany({
      where: {
        isUrgent: false, status: "STARTED",
        material: { equals: material, mode: "insensitive" }, thickness, width, length,
        heatNo: { in: [...new Set(rows.map(r => r.heatNo))], mode: "insensitive" },
      },
      select: { heatNo: true },
    });
    if (active.length) {
      const busy = new Map<string, number>();
      for (const a of active) { const k = (a.heatNo ?? "").trim().toUpperCase(); if (k) busy.set(k, (busy.get(k) ?? 0) + 1); }
      const out = rows.filter(r => {
        const k = r.heatNo.trim().toUpperCase(), n = busy.get(k) ?? 0;
        if (n > 0) { busy.set(k, n - 1); return false; }
        return true;
      });
      return NextResponse.json(out);
    }
  }

  return NextResponse.json(rows);
}
