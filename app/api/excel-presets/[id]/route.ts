import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/excel-presets/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (name !== undefined && !name?.trim()) {
      return NextResponse.json({ success: false, error: "프리셋 이름을 입력하세요." }, { status: 400 });
    }

    const existing = await prisma.excelPreset.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "프리셋을 찾을 수 없습니다." }, { status: 404 });
    }

    const preset = await prisma.excelPreset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(dataStartRow !== undefined && { dataStartRow: Number(dataStartRow) || 2 }),
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

    return NextResponse.json({ success: true, data: preset });
  } catch (error) {
    console.error("[PATCH /api/excel-presets/[id]]", error);
    return NextResponse.json({ success: false, error: "프리셋 수정 오류" }, { status: 500 });
  }
}

// DELETE /api/excel-presets/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.excelPreset.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "프리셋을 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.excelPreset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/excel-presets/[id]]", error);
    return NextResponse.json({ success: false, error: "프리셋 삭제 오류" }, { status: 500 });
  }
}
