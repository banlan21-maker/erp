import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/transport-repair — 수선/정비 이력 등록
export async function POST(request: NextRequest) {
  try {
    const { vehicleId, repairedAt, content, contractor, cost, memo } = await request.json();

    if (!vehicleId) {
      return NextResponse.json({ success: false, error: "차량/장비 ID는 필수입니다." }, { status: 400 });
    }
    if (!content?.trim()) {
      return NextResponse.json({ success: false, error: "수선 내용은 필수입니다." }, { status: 400 });
    }
    if (!repairedAt) {
      return NextResponse.json({ success: false, error: "수선일은 필수입니다." }, { status: 400 });
    }

    const log = await prisma.transportRepairLog.create({
      data: {
        vehicleId,
        repairedAt: new Date(repairedAt),
        content: content.trim(),
        contractor: contractor?.trim() || null,
        cost: cost ? Number(cost) : null,
        memo: memo?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: log }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/transport-repair]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}
