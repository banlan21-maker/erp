export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PlanStatus = "REGISTERED" | "RECEIVED" | "ISSUED" | "COMPLETED" | "SHIPPED_OUT";
const ALL_STATUSES: PlanStatus[] = ["REGISTERED", "RECEIVED", "ISSUED", "COMPLETED", "SHIPPED_OUT"];

const fmtT = (v: number) => parseFloat(v.toFixed(1));
const fmtL = (v: number) => Math.round(v);

type Spec = { vesselCode: string; material: string; thickness: number; width: number; length: number };
type PlanRow = {
  id: string; vesselCode: string; material: string; thickness: number; width: number; length: number;
  status: PlanStatus; uploadBatchNo: string | null; receivedAt: string | null;
  storageLocation: string | null; reservedFor: string | null;
  shipoutMarkedAt: string | null; shipoutLabel: string | null;
};
type MatchRow = { matched: boolean; spec: Spec; plan: PlanRow | null };

// GET /api/steel-match/[id]?statuses=RECEIVED,ISSUED
//   저장된 사양을 '현재' 강재전체목록과 매칭해서 반환 (호선 빈칸이면 호선 제외 매칭)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await prisma.steelMatchJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ success: false, error: "매칭 작업을 찾을 수 없습니다." }, { status: 404 });

    // 뷰 시점 상태 override(?statuses=) 가능, 없으면 저장된 값 사용
    const override = new URL(req.url).searchParams.get("statuses");
    const statusStr = override ?? job.statuses;
    // 잘못된 상태코드는 무시하고, 남는 게 없으면 전체로 폴백 (외부 ?statuses= 입력 방어)
    const statuses: PlanStatus[] = (() => {
      if (!statusStr || statusStr === "ALL") return ALL_STATUSES;
      const valid = statusStr.split(",").map(s => s.trim())
        .filter((s): s is PlanStatus => (ALL_STATUSES as string[]).includes(s));
      return valid.length ? valid : ALL_STATUSES;
    })();

    const specs = (Array.isArray(job.specs) ? job.specs : []) as unknown as Spec[];

    // 확정정보 필터: "NONE"이면 블록확정(reservedFor)·출고마킹(shipoutMarkedAt) 모두 없는 강재만
    const reservedNone = job.reservedFilter === "NONE";

    const plansRaw = await prisma.steelPlan.findMany({
      where: {
        status: { in: statuses },
        ...(reservedNone ? { reservedFor: null, shipoutMarkedAt: null } : {}),
      },
      select: {
        id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
        status: true, uploadBatchNo: true, receivedAt: true, storageLocation: true, reservedFor: true,
        shipoutMarkedAt: true, shipoutLabel: true,
      },
    });
    const plans: PlanRow[] = plansRaw.map(p => ({
      ...p,
      receivedAt: p.receivedAt ? p.receivedAt.toISOString() : null,
      shipoutMarkedAt: p.shipoutMarkedAt ? p.shipoutMarkedAt.toISOString() : null,
    }));

    const rows: MatchRow[] = [];
    // 같은 강재(plan.id)가 여러(중복) 사양에 매칭돼도 결과에는 1번만 노출
    // — 중복 행 + 체크박스 동반선택(하나 누르면 2개 선택) 방지
    const seenPlanIds = new Set<string>();
    for (const s of specs) {
      const matches = plans.filter(p =>
        (!s.vesselCode || p.vesselCode === s.vesselCode) &&
        p.material.trim().toUpperCase() === s.material.trim().toUpperCase() &&
        fmtT(p.thickness) === fmtT(s.thickness) &&
        fmtL(p.width)     === fmtL(s.width) &&
        fmtL(p.length)    === fmtL(s.length)
      );
      if (matches.length === 0) {
        rows.push({ matched: false, spec: s, plan: null });
      } else {
        // 아직 다른 사양에 잡히지 않은 강재만 새 행으로 추가
        for (const p of matches) {
          if (seenPlanIds.has(p.id)) continue;
          seenPlanIds.add(p.id);
          rows.push({ matched: true, spec: s, plan: p });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        job: { id: job.id, name: job.name, statuses: job.statuses, reservedFilter: job.reservedFilter, createdAt: job.createdAt.toISOString() },
        specs,   // 사용자가 업로드한 원본 사양 목록 (왼쪽 패널용)
        rows,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// PATCH /api/steel-match/[id] — 매칭 대상 상태(또는 이름) 수정
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { name?: string; statuses?: string; reservedFilter?: string } = {};
    if (body.name !== undefined) { const n = String(body.name).trim(); if (n) data.name = n; }
    if (body.statuses !== undefined) data.statuses = String(body.statuses) || "ALL";
    if (body.reservedFilter !== undefined) data.reservedFilter = body.reservedFilter === "NONE" ? "NONE" : "ANY";
    const job = await prisma.steelMatchJob.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: { id: job.id } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/steel-match/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.steelMatchJob.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
