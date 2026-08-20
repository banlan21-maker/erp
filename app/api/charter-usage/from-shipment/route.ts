import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeCharterCost, departureOf, itemsSummary } from "@/lib/charter-cost";

export const dynamic = "force-dynamic";

/**
 * POST /api/charter-usage/from-shipment  { vehicleIds: string[] }
 *   외부출고관리 목록에서 고른 송장(차량)을 용차사용대장에 일괄 등록한다.
 *
 * 왜 만드나: 출고 정보(날짜·차량·운전자·납품처·자재)가 이미 다 있는데 대장을 손으로 다시 적고 있었다.
 *
 * 규칙
 *   · 진교 출발분만 — 다른 곳에서 출발한 건은 대장 성격이 달라 자동등록에서 뺀다
 *   · 이미 등록된 송장은 건너뛴다(shipmentVehicleId @unique 로 중복 차단)
 *   · 취소된 출고장은 제외
 *   · 금액은 단가표로 계산해 넣되, 단가가 없으면 비워 두고 사유를 비고에 남긴다
 *   · 등록 후 대장에서 자유롭게 수정할 수 있다
 *
 * DELETE /api/charter-usage/from-shipment  { vehicleIds: string[] }
 *   용차 지정 취소 — 그 송장으로 자동 등록된 대장 행을 지운다(사람이 손댄 것도 지우므로 확인 필요).
 */

const REQUIRED_DEPARTURE = "진교";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.vehicleIds)
      ? body.vehicleIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "선택된 송장이 없습니다." }, { status: 400 });
    }

    const vehicles = await prisma.shipmentVehicle.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, vehicleNo: true, driverName: true, driverPhone: true,
        supplierSnapshot: true, deliverySnapshot: true,
        shipment: { select: { shippedAt: true, status: true, shipmentNo: true } },
        charterUsage: { select: { id: true } },
        items: { select: { vesselCode: true, block: true, weight: true, width: true, remnantNo: true } },
      },
    });

    const created: string[] = [];
    const skipped: { no: string; why: string }[] = [];

    for (const v of vehicles) {
      const label = v.shipment?.shipmentNo ?? v.id.slice(-6);
      if (v.charterUsage) { skipped.push({ no: label, why: "이미 용차로 등록됨" }); continue; }
      if (v.shipment?.status !== "ACTIVE") { skipped.push({ no: label, why: "취소된 출고장" }); continue; }

      const departure = departureOf(v.supplierSnapshot);
      if (departure !== REQUIRED_DEPARTURE) {
        skipped.push({ no: label, why: `출발지가 ${departure ?? "미상"} — 진교 출발분만 자동등록` });
        continue;
      }

      const delivery = (() => {
        const s = v.deliverySnapshot;
        if (s && typeof s === "object" && "name" in s) {
          const n = (s as { name?: unknown }).name;
          return typeof n === "string" ? n.trim() : null;
        }
        return null;
      })();

      const calc = await computeCharterCost(prisma, delivery, v.items.map(i => i.width));

      await prisma.charterUsage.create({
        data: {
          date: v.shipment.shippedAt,
          driverName: v.driverName?.trim() || "(미입력)",
          driverPhone: v.driverPhone?.trim() || null,
          vehicleNo: v.vehicleNo?.trim() || null,
          items: itemsSummary(v.items),
          departure: REQUIRED_DEPARTURE,
          destination: delivery,
          departTime: null,          // 출고에 시각이 없다 — 대장에서도 안 쓴다
          cost: calc.cost,
          memo: `[자동] ${label} · ${calc.note}`,
          shipmentVehicleId: v.id,
        },
      });
      created.push(label);
    }

    const notFound = ids.length - vehicles.length;
    return NextResponse.json({
      success: true,
      created: created.length,
      skipped,
      notFound,
      message:
        `용차 ${created.length}건 등록` +
        (skipped.length ? ` · ${skipped.length}건 제외` : "") +
        (notFound ? ` · ${notFound}건 조회 실패` : ""),
    }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/charter-usage/from-shipment]", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "등록 오류" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body?.vehicleIds)
      ? body.vehicleIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: "선택된 송장이 없습니다." }, { status: 400 });
    }
    const res = await prisma.charterUsage.deleteMany({ where: { shipmentVehicleId: { in: ids } } });
    return NextResponse.json({ success: true, deleted: res.count, message: `용차 지정 ${res.count}건 해제` });
  } catch (error) {
    console.error("[DELETE /api/charter-usage/from-shipment]", error);
    return NextResponse.json({ success: false, error: "해제 오류" }, { status: 500 });
  }
}
