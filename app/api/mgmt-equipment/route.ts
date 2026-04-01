import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 장비코드 자동채번: EQP-001
async function generateCode(): Promise<string> {
  const count = await prisma.mgmtEquipment.count();
  return `EQP-${String(count + 1).padStart(3, "0")}`;
}

// 다음 검사 예정일 계산
function calcNextInspect(lastDate: Date, periodMonth: number): Date {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + periodMonth);
  return d;
}

// GET /api/mgmt-equipment
export async function GET() {
  try {
    const equipments = await prisma.mgmtEquipment.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        specs: { orderBy: { sortOrder: "asc" } },
        inspections: true,
      },
    });
    return NextResponse.json({ success: true, data: equipments });
  } catch (error) {
    console.error("[GET /api/mgmt-equipment]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

// POST /api/mgmt-equipment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name, kind, maker, modelName, madeYear, acquiredAt, acquiredCost,
      location, usage, memo, specs, inspections,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "장비명은 필수입니다." }, { status: 400 });
    }
    if (!kind) {
      return NextResponse.json({ success: false, error: "장비 종류는 필수입니다." }, { status: 400 });
    }

    const code = await generateCode();

    const equipment = await prisma.mgmtEquipment.create({
      data: {
        code,
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
        inspections: {
          create: (inspections || [])
            .filter((ins: { itemName: string; periodMonth: number }) => ins.itemName?.trim())
            .map((ins: { itemName: string; periodMonth: number; lastInspectedAt?: string; inspector?: string; memo?: string }) => {
              const last = ins.lastInspectedAt ? new Date(ins.lastInspectedAt) : null;
              const next = last ? calcNextInspect(last, Number(ins.periodMonth)) : null;
              return {
                itemName: ins.itemName.trim(),
                periodMonth: Number(ins.periodMonth),
                lastInspectedAt: last,
                nextInspectAt: next,
                inspector: ins.inspector?.trim() || null,
                memo: ins.memo?.trim() || null,
              };
            }),
        },
      },
      include: {
        specs: { orderBy: { sortOrder: "asc" } },
        inspections: true,
      },
    });

    return NextResponse.json({ success: true, data: equipment }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/mgmt-equipment]", error);
    return NextResponse.json({ success: false, error: "등록 오류" }, { status: 500 });
  }
}
