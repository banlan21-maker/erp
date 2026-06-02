import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/mgmt-repair/[id] — 수선이력 수정 (costs 전체 교체)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { repairedAt, cause, content, contractor, costs, downtimeHours, downtimeMins, memo } = await request.json();

    const costItems: { itemName: string; amount: number }[] = Array.isArray(costs)
      ? costs
          .map((c: { itemName?: string; amount?: number | string }) => ({
            itemName: String(c.itemName ?? "").trim(),
            amount: Math.round(Number(c.amount) || 0),
          }))
          .filter((c) => c.itemName && c.amount > 0)
      : [];
    const total = costItems.reduce((s, c) => s + c.amount, 0);

    // costs 갱신: 기존 전체 삭제 후 재삽입 (트랜잭션)
    const updated = await prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (repairedAt !== undefined) data.repairedAt = new Date(repairedAt);
      if (cause      !== undefined) data.cause = cause?.trim() || null;
      if (content    !== undefined) data.content = content?.trim() || "";
      if (contractor !== undefined) data.contractor = contractor?.trim() || null;
      if (memo       !== undefined) data.memo = memo?.trim() || null;
      if (Array.isArray(costs))     data.cost = total || null;
      if (downtimeHours !== undefined || downtimeMins !== undefined) {
        const h = Number(downtimeHours) || 0;
        const m = Number(downtimeMins)  || 0;
        data.downtimeMinutes = (h > 0 || m > 0) ? h * 60 + m : null;
      }

      await tx.mgmtRepairLog.update({ where: { id }, data });

      if (Array.isArray(costs)) {
        await tx.mgmtRepairCost.deleteMany({ where: { repairId: id } });
        if (costItems.length > 0) {
          await tx.mgmtRepairCost.createMany({
            data: costItems.map((c, i) => ({ repairId: id, itemName: c.itemName, amount: c.amount, sortOrder: i })),
          });
        }
      }

      return tx.mgmtRepairLog.findUnique({
        where: { id },
        include: { costs: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/mgmt-repair/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

// DELETE /api/mgmt-repair/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.mgmtRepairLog.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/mgmt-repair/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}
