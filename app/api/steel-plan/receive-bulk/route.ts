/**
 * POST /api/steel-plan/receive-bulk
 *
 * 일괄 입고 처리.
 * 입력된 행(호선+재질+두께+폭+길이) 각각에 대해 REGISTERED → RECEIVED로 처리.
 *
 * Request body:
 *   { receivedAt?: string (ISO date), items: Array<{ vesselCode, material, thickness, width, length, qty? }> }
 *
 * Response:
 *   { results: Array<{ ...item, matched: number, notFound: boolean }> }
 *
 * 동작:
 *   - 각 행의 스펙과 일치하는 REGISTERED 상태 SteelPlan을 qty만큼 찾아 RECEIVED 처리
 *   - qty 미지정 시 일치하는 전체를 처리
 *   - 일치하는 항목이 없으면 notFound: true 반환
 *   - 입고 처리 후 syncDrawingListBySpec으로 DrawingList 재계산
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDrawingListBySpec } from "@/lib/sync-drawing-spec";

interface BulkItem {
  vesselCode:      string;
  material:        string;
  thickness:       number;
  width:           number;
  length:          number;
  qty?:            number;
  storageLocation?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, receivedAt }: { items: BulkItem[]; receivedAt?: string } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "입고 항목이 없습니다." }, { status: 400 });
    }

    // 입고일: 전달된 날짜 사용, 없으면 현재 시각
    const receivedDate = receivedAt ? new Date(receivedAt) : new Date();

    const results = [];

    for (const item of items) {
      const { vesselCode, material, thickness, width, length, qty, storageLocation } = item;

      if (!vesselCode || !material || !thickness || !width || !length) {
        results.push({ ...item, matched: 0, notFound: false, error: "필수값 누락" });
        continue;
      }

      // 조건 일치하는 REGISTERED 항목 검색
      const targets = await prisma.steelPlan.findMany({
        where: {
          vesselCode,
          material:  { equals: material, mode: "insensitive" },
          thickness: Number(thickness),
          width:     Number(width),
          length:    Number(length),
          status:    "REGISTERED",
        },
        orderBy: { createdAt: "asc" },
        take:    qty ? Number(qty) : 9999,
      });

      if (targets.length === 0) {
        results.push({ ...item, matched: 0, notFound: true });
        continue;
      }

      // 입고 처리
      const { count } = await prisma.steelPlan.updateMany({
        where: { id: { in: targets.map(t => t.id) } },
        data:  {
          status:          "RECEIVED",
          receivedAt:      receivedDate,
          ...(storageLocation !== undefined ? { storageLocation: storageLocation || null } : {}),
        },
      });

      // DrawingList 재계산
      await syncDrawingListBySpec(vesselCode, material, Number(thickness), Number(width), Number(length));

      results.push({ ...item, matched: count, notFound: false });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("[POST /api/steel-plan/receive-bulk]", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
