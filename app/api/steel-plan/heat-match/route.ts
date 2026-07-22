/**
 * 판번호 매칭 검색 — 사양 5개(vesselCode/material/thickness/width/length)로 같은 사양의
 * SteelPlanHeat 목록 반환. 출고장 만들기 모달에서 행마다 호출.
 *
 * GET /api/steel-plan/heat-match?vesselCode=&material=&thickness=&width=&length=&status=WAITING,CUT
 *   status 쿼리로 필터 가능 (기본: WAITING + CUT — SHIPPED 제외)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SteelPlanHeatStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const FLOAT_TOL = 0.001;

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const vesselCode = sp.get("vesselCode") ?? "";
    const material   = sp.get("material")   ?? "";
    const t = parseFloat(sp.get("thickness") ?? "");
    const w = parseFloat(sp.get("width")     ?? "");
    const l = parseFloat(sp.get("length")    ?? "");

    if (!vesselCode || !material || !isFinite(t) || !isFinite(w) || !isFinite(l)) {
      return NextResponse.json({ success: false, error: "사양 파라미터가 부족합니다." }, { status: 400 });
    }

    const statusParam = sp.get("status");
    const allStatus: SteelPlanHeatStatus[] = ["WAITING", "CUT", "SHIPPED"];
    const statuses = statusParam
      ? statusParam.split(",").map(s => s.trim()).filter((s): s is SteelPlanHeatStatus =>
          (allStatus as string[]).includes(s),
        )
      : (["WAITING", "CUT"] as SteelPlanHeatStatus[]);

    // 부동소수점 — 두께/폭/길이는 모두 .001 허용 (range 검색)
    //
    // ★ vesselCode 는 필터가 아니라 정렬 기준으로만 쓴다.
    //   판번호는 철판 한 장의 고유번호이고 호선은 "어느 호선 예산으로 입고됐나" 라는 꼬리표다.
    //   야드에 같은 규격의 자매호선 철판이 섞여 쌓이므로 호선으로 잠그면 유용 강재의 판번호가
    //   후보에 절대 안 뜨고, 사용자가 손으로 치게 되어 출고 확정 시 잘못된 호선으로 같은
    //   판번호가 새로 생성된다(유령 판번호). 호선은 배지로 표시해 실물과 대조하게 한다.
    const list = await prisma.steelPlanHeat.findMany({
      where: {
        material,
        thickness: { gte: t - FLOAT_TOL, lte: t + FLOAT_TOL },
        width:     { gte: w - FLOAT_TOL, lte: w + FLOAT_TOL },
        length:    { gte: l - FLOAT_TOL, lte: l + FLOAT_TOL },
        status:    { in: statuses },
      },
      orderBy: [{ status: "asc" }, { heatNo: "asc" }],
      take: 400,
    });

    // 요청 호선의 판번호를 앞에, 다른 호선은 뒤에 (각 그룹 안에서는 기존 정렬 유지)
    const sorted = [
      ...list.filter(h => h.vesselCode === vesselCode),
      ...list.filter(h => h.vesselCode !== vesselCode),
    ];

    return NextResponse.json({
      success: true,
      data: sorted.map(h => ({
        ...h,
        cutAt:     h.cutAt?.toISOString()     ?? null,
        shippedAt: h.shippedAt?.toISOString() ?? null,
        createdAt: h.createdAt.toISOString(),
        updatedAt: h.updatedAt.toISOString(),
        otherVessel: h.vesselCode !== vesselCode,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
