import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/excel-presets
export async function GET() {
  try {
    const presets = await prisma.excelPreset.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ success: true, data: presets });
  } catch (error) {
    console.error("[GET /api/excel-presets]", error);
    return NextResponse.json({ success: false, error: "프리셋 조회 오류" }, { status: 500 });
  }
}

// POST /api/excel-presets
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      dataStartRow,
      colBlock,
      colDrawingNo,
      colHeatNo,
      colMaterial,
      colThickness,
      colWidth,
      colLength,
      colQty,
      colSteelWeight,
      colUseWeight,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: "프리셋 이름을 입력하세요." }, { status: 400 });
    }

    const preset = await prisma.excelPreset.create({
      data: {
        name: name.trim(),
        dataStartRow: Number(dataStartRow) || 2,
        colBlock: colBlock ? Number(colBlock) : null,
        colDrawingNo: colDrawingNo ? Number(colDrawingNo) : null,
        colHeatNo: colHeatNo ? Number(colHeatNo) : null,
        colMaterial: colMaterial ? Number(colMaterial) : null,
        colThickness: colThickness ? Number(colThickness) : null,
        colWidth: colWidth ? Number(colWidth) : null,
        colLength: colLength ? Number(colLength) : null,
        colQty: colQty ? Number(colQty) : null,
        colSteelWeight: colSteelWeight ? Number(colSteelWeight) : null,
        colUseWeight: colUseWeight ? Number(colUseWeight) : null,
      },
    });

    return NextResponse.json({ success: true, data: preset }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/excel-presets]", error);
    return NextResponse.json({ success: false, error: "프리셋 저장 오류" }, { status: 500 });
  }
}
