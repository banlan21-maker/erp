import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseExcelBuffer, parseExcelBufferWithPreset } from "@/lib/excel-parser";

// GET /api/drawings?projectId=xxx - 강재리스트 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId가 필요합니다." },
        { status: 400 }
      );
    }

    const status = searchParams.get("status"); // 예: "WAITING"

    const drawings = await prisma.drawingList.findMany({
      where: {
        projectId,
        ...(status ? { status: status as "REGISTERED" | "WAITING" | "CUT" } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: drawings });
  } catch (error) {
    console.error("[GET /api/drawings]", error);
    return NextResponse.json(
      { success: false, error: "강재리스트 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/drawings - Excel 업로드(multipart) 또는 수동 행 추가(JSON)
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // ── JSON: 수동 행 추가 ───────────────────────────────────────────────────
    if (contentType.includes("application/json")) {
      const { projectId, rows } = await request.json();

      if (!projectId || !Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "projectId와 rows가 필요합니다." },
          { status: 400 }
        );
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        return NextResponse.json({ success: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }

      const created = await prisma.drawingList.createMany({
        data: rows.map((r: {
          block?: string; drawingNo?: string; heatNo?: string;
          material: string; thickness: number; width: number; length: number;
          qty: number; steelWeight?: number | null; useWeight?: number | null;
        }) => ({
          projectId,
          block: r.block?.trim() || null,
          drawingNo: r.drawingNo?.trim() || null,
          heatNo: r.heatNo?.trim() || null,
          material: r.material.trim(),
          thickness: Number(r.thickness),
          width: Number(r.width),
          length: Number(r.length),
          qty: Math.round(Number(r.qty)),
          steelWeight: r.steelWeight != null && r.steelWeight !== 0 ? Number(r.steelWeight) : null,
          useWeight: r.useWeight != null && r.useWeight !== 0 ? Number(r.useWeight) : null,
          sourceFile: null,
        })),
      });

      return NextResponse.json({ success: true, data: { count: created.count } }, { status: 201 });
    }

    // ── multipart: Excel 업로드 ──────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;
    const presetId = formData.get("presetId") as string | null;
    const storageLocation = formData.get("storageLocation") as string | null;

    if (!file || !projectId) {
      return NextResponse.json(
        { success: false, error: "file과 projectId가 필요합니다." },
        { status: 400 }
      );
    }

    // 프로젝트 존재 확인
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Buffer 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Excel 파싱 (프리셋 또는 자동감지)
    let result;
    if (presetId) {
      const presetRow = await prisma.excelPreset.findUnique({ where: { id: presetId } });
      if (presetRow) {
        result = parseExcelBufferWithPreset(buffer, file.name, presetRow);
      } else {
        result = parseExcelBuffer(buffer, file.name);
      }
    } else {
      result = parseExcelBuffer(buffer, file.name);
    }

    if (!result.success || result.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Excel 파싱에 실패했습니다.",
          details: result.errors,
        },
        { status: 422 }
      );
    }

    // 보관위치 업데이트 (입력된 경우)
    if (storageLocation?.trim()) {
      await prisma.project.update({
        where: { id: projectId },
        data: { storageLocation: storageLocation.trim() },
      });
    }

    // SteelPlan 조회 (호선 = projectCode 기준)
    const steelPlans = await prisma.steelPlan.findMany({
      where: { vesselCode: project.projectCode },
      select: { material: true, thickness: true, width: true, length: true, status: true },
    });

    // 매칭 헬퍼
    const matchSteelPlan = (material: string, thickness: number, width: number, length: number) => {
      return steelPlans.find(
        (sp) =>
          sp.material.trim().toLowerCase() === material.trim().toLowerCase() &&
          sp.thickness === thickness &&
          sp.width === width &&
          sp.length === length
      );
    };

    // DB 저장 (배치 insert)
    // block 우선순위: 프리셋 colBlock에서 읽은 값(있을 때) > project.projectName(기본)
    const created = await prisma.drawingList.createMany({
      data: result.rows.map((row) => {
        const matched = matchSteelPlan(row.material, row.thickness, row.width, row.length);
        let status: "REGISTERED" | "WAITING" | "CAUTION" = "CAUTION";
        if (matched) {
          status = matched.status === "RECEIVED" ? "WAITING" : "REGISTERED";
        }
        return {
          projectId,
          block: row.block?.trim() || project.projectName,
          drawingNo: row.drawingNo,
          heatNo: row.heatNo,
          material: row.material,
          thickness: row.thickness,
          width: row.width,
          length: row.length,
          qty: row.qty,
          steelWeight: row.steelWeight,
          useWeight: row.useWeight,
          sourceFile: file.name,
          status,
        };
      }),
    });

    return NextResponse.json(
      {
        success: true,
        data: { count: created.count, warnings: result.errors },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/drawings]", error);
    return NextResponse.json(
      { success: false, error: "강재리스트 업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/drawings?projectId=xxx - 프로젝트 전체 강재리스트 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId가 필요합니다." },
        { status: 400 }
      );
    }

    const deleted = await prisma.drawingList.deleteMany({ where: { projectId } });
    return NextResponse.json({ success: true, data: { count: deleted.count } });
  } catch (error) {
    console.error("[DELETE /api/drawings]", error);
    return NextResponse.json(
      { success: false, error: "전체 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
