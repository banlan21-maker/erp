import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function calcNextInspect(lastDate: Date, periodMonth: number): Date {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + periodMonth);
  return d;
}

// GET /api/mgmt-equipment/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const equipment = await prisma.mgmtEquipment.findUnique({
      where: { id },
      include: {
        specs: { orderBy: { sortOrder: "asc" } },
        inspections: {
          include: {
            logs: { orderBy: { completedAt: "desc" } },
          },
        },
        repairs: { orderBy: { repairedAt: "desc" } },
      },
    });
    if (!equipment) {
      return NextResponse.json({ success: false, error: "장비를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: equipment });
  } catch (error) {
    console.error("[GET /api/mgmt-equipment/[id]]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// PATCH /api/mgmt-equipment/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name, kind, maker, modelName, madeYear, acquiredAt, acquiredCost,
      location, usage, memo, specs, inspections,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "장비명은 필수입니다." }, { status: 400 });
    }

    // 트랜잭션으로 사양/검사항목 교체
    const updated = await prisma.$transaction(async (tx) => {
      // 기존 사양 삭제 후 재생성
      await tx.mgmtEquipmentSpec.deleteMany({ where: { equipmentId: id } });

      // 기존 검사항목 처리: 새 목록에 없는 항목만 삭제 (이력 있는 항목은 유지)
      const existingItems = await tx.mgmtInspectionItem.findMany({ where: { equipmentId: id } });
      const incomingIds = (inspections || []).map((i: { id?: string }) => i.id).filter(Boolean);
      const toDelete = existingItems.filter(e => !incomingIds.includes(e.id));
      for (const item of toDelete) {
        await tx.mgmtInspectionLog.deleteMany({ where: { itemId: item.id } });
        await tx.mgmtInspectionItem.delete({ where: { id: item.id } });
      }

      // 장비 기본정보 업데이트 + 사양 재생성
      const eq = await tx.mgmtEquipment.update({
        where: { id },
        data: {
          name: name.trim(),
          kind,
          maker: maker?.trim() || null,
          modelName: modelName?.trim() || null,
          madeYear: madeYear ? Number(madeYear) : null,
          acquiredAt: acquiredAt ? new Date(acquiredAt) : null,
          acquiredCost: acquiredCost ? Number(acquiredCost) : null,
          location: location?.trim() || null,
          usage: usage || "IN_USE",
          memo: memo?.trim() || null,
          specs: {
            create: (specs || [])
              .filter((s: { specKey: string; specValue: string }) => s.specKey?.trim())
              .map((s: { specKey: string; specValue: string }, i: number) => ({
                specKey: s.specKey.trim(),
                specValue: s.specValue?.trim() || "",
                sortOrder: i,
              })),
          },
        },
        include: { specs: { orderBy: { sortOrder: "asc" } } },
      });

      // 검사항목 upsert
      for (let i = 0; i < (inspections || []).length; i++) {
        const ins = inspections[i];
        if (!ins.itemName?.trim()) continue;
        const last = ins.lastInspectedAt ? new Date(ins.lastInspectedAt) : null;
        const next = last ? calcNextInspect(last, Number(ins.periodMonth)) : null;
        const data = {
          itemName: ins.itemName.trim(),
          periodMonth: Number(ins.periodMonth),
          lastInspectedAt: last,
          nextInspectAt: next,
          inspector: ins.inspector?.trim() || null,
          memo: ins.memo?.trim() || null,
        };
        if (ins.id) {
          await tx.mgmtInspectionItem.update({ where: { id: ins.id }, data });
        } else {
          await tx.mgmtInspectionItem.create({ data: { equipmentId: id, ...data } });
        }
      }

      return eq;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/mgmt-equipment/[id]]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

// DELETE /api/mgmt-equipment/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.mgmtEquipment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/mgmt-equipment/[id]]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}
