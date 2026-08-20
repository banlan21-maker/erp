import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/charter-usage/extra  { id, code }
 *   대장 한 행의 추가항목(가변/슬라이드·합짐)을 켜고 끈다 — 누를 때마다 토글.
 *
 * 금액은 그 자리에서 더하거나 뺀다:
 *   켜면 cost += 금액 / 끄면 cost -= 금액
 * 비용을 다시 계산하지 않고 가감만 하는 이유 — 사용자가 대장에서 금액을 직접 고쳐 두는 경우가
 * 있어(자동계산이 안 맞는 4% 구간), 재계산하면 그 손질이 날아간다. 가감은 무엇을 고쳐 뒀든
 * "누른 만큼만" 움직여서 예측 가능하다.
 */
export async function POST(req: NextRequest) {
  try {
    const { id, code } = await req.json();
    if (!id || !code) {
      return NextResponse.json({ success: false, error: "id 와 code 가 필요합니다." }, { status: 400 });
    }

    const [row, extra] = await Promise.all([
      prisma.charterUsage.findUnique({ where: { id }, select: { extras: true, cost: true } }),
      prisma.charterExtra.findUnique({ where: { code: String(code) } }),
    ]);
    if (!row)   return NextResponse.json({ success: false, error: "대장 항목을 찾을 수 없습니다." }, { status: 404 });
    if (!extra) return NextResponse.json({ success: false, error: "추가항목을 찾을 수 없습니다." }, { status: 404 });

    const cur = (row.extras ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const on = cur.includes(extra.code);
    const next = on ? cur.filter(c => c !== extra.code) : [...cur, extra.code];
    const cost = (row.cost ?? 0) + (on ? -extra.amount : extra.amount);

    const updated = await prisma.charterUsage.update({
      where: { id },
      data: { extras: next.length ? next.join(",") : null, cost },
      select: { id: true, extras: true, cost: true },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      turnedOn: !on,
      message: `${extra.label} ${on ? "해제" : "적용"} (${on ? "-" : "+"}${extra.amount.toLocaleString()}원)`,
    });
  } catch (e) {
    console.error("[POST /api/charter-usage/extra]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "처리 오류" }, { status: 500 });
  }
}
