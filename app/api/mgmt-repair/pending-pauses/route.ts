export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 작업일보 장비고장 정지 중 수선이력에 아직 반영 안 된 것 (2026-10-02)
 *
 * 현장이 [중단 → 장비고장] 을 누르면 정지 기록이 남는데, 장비관리 수선이력은 관리자가 따로 쓴다.
 * 둘이 이어지지 않아 고장이 수선이력에 빠지거나, 정지 시간을 다시 계산해 적어야 했다.
 * 자동으로 수선이력을 만들지는 않는다 — 관리자가 이미 직접 꼼꼼히 쓰고 있어(원인·조치·비가동시간)
 * 자동 초안을 만들면 같은 고장이 두 번 들어간다. 대신 목록으로 보여 주고, 고르면 날짜·정지시간이
 * 채워진 등록 화면을 연다. 저장 시 /api/mgmt-repair 가 pauseIds 로 이 정지들을 그 수선이력에 묶는다.
 *
 * GET  ?days=30                         → 미반영 고장 정지 목록 (장비관리 장비와 연결된 현장 장비만)
 * POST { action: "dismiss", ids }       → "수선 아님 / 이미 등록함" — 목록에서 뺀다
 */

export async function GET(req: NextRequest) {
  try {
    const days = Math.min(365, Math.max(1, parseInt(new URL(req.url).searchParams.get("days") ?? "30") || 30));
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await prisma.cuttingPause.findMany({
      where: {
        reason: "EQUIPMENT_FAILURE",
        pausedAt: { gte: since },
        repairLogId: null,
        repairDismissedAt: null,
        cuttingLog: { equipment: { mgmtEquipmentId: { not: null } } },
      },
      orderBy: { pausedAt: "desc" },
      select: {
        id: true, pausedAt: true, resumedAt: true, reasonText: true,
        cuttingLog: {
          select: {
            operator: true, drawingNo: true,
            equipment: { select: { name: true, mgmtEquipmentId: true, mgmtEquipment: { select: { name: true } } } },
          },
        },
      },
    });
    const data = rows.map(r => ({
      id: r.id,
      pausedAt: r.pausedAt,
      resumedAt: r.resumedAt,
      minutes: r.resumedAt ? Math.round((r.resumedAt.getTime() - r.pausedAt.getTime()) / 60000) : null,
      reasonText: r.reasonText,
      operator: r.cuttingLog.operator,
      drawingNo: r.cuttingLog.drawingNo,
      equipmentName: r.cuttingLog.equipment.name,
      mgmtEquipmentId: r.cuttingLog.equipment.mgmtEquipmentId!,
      mgmtEquipmentName: r.cuttingLog.equipment.mgmtEquipment?.name ?? "",
    }));
    return NextResponse.json({ success: true, data, days });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 오류" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (b?.action !== "dismiss") return NextResponse.json({ success: false, error: "알 수 없는 요청입니다." }, { status: 400 });
    const ids: string[] = Array.isArray(b.ids) ? b.ids : [];
    if (!ids.length) return NextResponse.json({ success: false, error: "선택된 정지 기록이 없습니다." }, { status: 400 });
    const r = await prisma.cuttingPause.updateMany({
      where: { id: { in: ids }, reason: "EQUIPMENT_FAILURE", repairLogId: null, repairDismissedAt: null },
      data: { repairDismissedAt: new Date() },
    });
    return NextResponse.json({ success: true, count: r.count });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "처리 오류" }, { status: 500 });
  }
}
