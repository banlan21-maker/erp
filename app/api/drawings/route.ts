import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseExcelBuffer, parseExcelBufferWithPreset } from "@/lib/excel-parser";

// ── 업로드/입고 후 스펙·블록별 확정(reservedFor) 수량 기준으로 상태 동기화 ──
// 확정된 블록만 WAITING, 미확정 블록은 REGISTERED
async function syncSpecsAfterUpload(
  vesselCode: string,
  specs: { material: string; thickness: number; width: number; length: number }[]
) {
  const projects = await prisma.project.findMany({
    where: { projectCode: vesselCode },
    select: { id: true },
  });
  if (projects.length === 0) return;
  const projectIds = projects.map((p) => p.id);

  const uniqueSpecs = [
    ...new Map(
      specs.map((s) => [`${s.material}|${s.thickness}|${s.width}|${s.length}`, s])
    ).values(),
  ];

  for (const spec of uniqueSpecs) {
    const { material, thickness, width, length } = spec;

    const rows = await prisma.drawingList.findMany({
      where: {
        projectId: { in: projectIds },
        material, thickness, width, length,
        NOT: { status: { in: ["CAUTION", "CUT"] } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, block: true },
    });

    // 블록별 그룹화 → 각 블록의 확정 수량만큼 WAITING
    const byBlock = new Map<string, string[]>();
    for (const row of rows) {
      const blockCode = row.block ?? "UNKNOWN";
      if (!byBlock.has(blockCode)) byBlock.set(blockCode, []);
      byBlock.get(blockCode)!.push(row.id);
    }

    const toWaiting: string[] = [];
    const toRegistered: string[] = [];

    for (const [blockCode, ids] of byBlock) {
      const confirmedCount = await prisma.steelPlan.count({
        where: { vesselCode, material, thickness, width, length, status: "RECEIVED", reservedFor: blockCode },
      });
      toWaiting.push(...ids.slice(0, confirmedCount));
      toRegistered.push(...ids.slice(confirmedCount));
    }

    if (toWaiting.length > 0) {
      await prisma.drawingList.updateMany({ where: { id: { in: toWaiting } }, data: { status: "WAITING" } });
    }
    if (toRegistered.length > 0) {
      await prisma.drawingList.updateMany({ where: { id: { in: toRegistered } }, data: { status: "REGISTERED" } });
    }
  }
}

// GET /api/drawings?projectId=xxx&status=WAITING — 강재리스트 조회
// GET /api/drawings?projectId=xxx&confirmed=true  — 확정된 항목만 조회 (현장 작업일보용)
// GET /api/drawings?allConfirmed=true             — 전체 프로젝트 확정(WAITING/CUT) 목록 (관리자 작업일보용)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId    = searchParams.get("projectId");
    const allConfirmed = searchParams.get("allConfirmed") === "true";

    // 전체 프로젝트 확정 목록 (projectId 불필요)
    if (allConfirmed) {
      const drawings = await prisma.drawingList.findMany({
        where: { status: { in: ["WAITING", "CUT"] } },
        include: { project: { select: { id: true, projectCode: true, projectName: true } } },
        orderBy: [{ projectId: "asc" }, { createdAt: "asc" }],
      });
      return NextResponse.json({ success: true, data: drawings });
    }

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId가 필요합니다." },
        { status: 400 }
      );
    }

    const status    = searchParams.get("status");
    const confirmed = searchParams.get("confirmed");

    // confirmed=true: SteelPlan.reservedFor = block 인 WAITING 행만 반환
    if (confirmed === "true") {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { projectCode: true },
      });
      if (!project) {
        return NextResponse.json({ success: true, data: [] });
      }

      const waitingRows = await prisma.drawingList.findMany({
        where: { projectId, status: "WAITING" },
        orderBy: { createdAt: "asc" },
      });

      const result = [];
      for (const row of waitingRows) {
        const reserved = await prisma.steelPlan.findFirst({
          where: {
            vesselCode: project.projectCode,
            material:   row.material,
            thickness:  row.thickness,
            width:      row.width,
            length:     row.length,
            status:     "RECEIVED",
            reservedFor: row.block ?? "UNKNOWN",
          },
          select: { id: true },
        });
        if (reserved) result.push(row);
      }

      return NextResponse.json({ success: true, data: result });
    }

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

      // 강재입고관리 스펙 조회 (매칭 여부 확인용 — 수량은 syncSpecsAfterUpload에서 처리)
      const steelPlans = await prisma.steelPlan.findMany({
        where: { vesselCode: project.projectCode },
        select: { material: true, thickness: true, width: true, length: true },
      });
      const hasMatch = (material: string, thickness: number, width: number, length: number) =>
        steelPlans.some(
          (sp) =>
            sp.material.trim().toLowerCase() === material.trim().toLowerCase() &&
            sp.thickness === thickness && sp.width === width && sp.length === length
        );

      const rowsToInsert = rows.map((r: {
        block?: string; drawingNo?: string; heatNo?: string;
        material: string; thickness: number; width: number; length: number;
        qty: number; steelWeight?: number | null; useWeight?: number | null;
      }) => {
        const t = Number(r.thickness), w = Number(r.width), l = Number(r.length);
        const mat = r.material.trim();
        // 초기 상태: 강재입고관리에 규격 존재 → 미입고(REGISTERED), 없음 → 경고(CAUTION)
        // 정확한 입고/미입고 구분은 아래 syncSpecsAfterUpload에서 재조정
        const status: "REGISTERED" | "CAUTION" = hasMatch(mat, t, w, l) ? "REGISTERED" : "CAUTION";
        return {
          projectId,
          block: r.block?.trim() || null,
          drawingNo: r.drawingNo?.trim() || null,
          heatNo: r.heatNo?.trim() || null,
          material: mat,
          thickness: t, width: w, length: l,
          qty: Math.round(Number(r.qty)),
          steelWeight: r.steelWeight != null && r.steelWeight !== 0 ? Number(r.steelWeight) : null,
          useWeight: r.useWeight != null && r.useWeight !== 0 ? Number(r.useWeight) : null,
          sourceFile: null,
          status,
        };
      });

      const created = await prisma.drawingList.createMany({ data: rowsToInsert });

      // 입고 수량 기준으로 정확히 재조정
      const matchedSpecs = rowsToInsert
        .filter((r) => r.status === "REGISTERED")
        .map((r) => ({ material: r.material, thickness: r.thickness, width: r.width, length: r.length }));
      if (matchedSpecs.length > 0) {
        await syncSpecsAfterUpload(project.projectCode, matchedSpecs);
      }

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

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "프로젝트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let result;
    if (presetId) {
      const presetRow = await prisma.excelPreset.findUnique({ where: { id: presetId } });
      result = presetRow ? parseExcelBufferWithPreset(buffer, file.name, presetRow) : parseExcelBuffer(buffer, file.name);
    } else {
      result = parseExcelBuffer(buffer, file.name);
    }

    if (!result.success || result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Excel 파싱에 실패했습니다.", details: result.errors },
        { status: 422 }
      );
    }

    if (storageLocation?.trim()) {
      await prisma.project.update({
        where: { id: projectId },
        data: { storageLocation: storageLocation.trim() },
      });
    }

    // 강재입고관리 스펙 조회 (매칭 여부 확인용)
    const steelPlans = await prisma.steelPlan.findMany({
      where: { vesselCode: project.projectCode },
      select: { material: true, thickness: true, width: true, length: true },
    });
    const hasMatch = (material: string, thickness: number, width: number, length: number) =>
      steelPlans.some(
        (sp) =>
          sp.material.trim().toLowerCase() === material.trim().toLowerCase() &&
          sp.thickness === thickness && sp.width === width && sp.length === length
      );

    const rowsToInsert = result.rows.map((row) => {
      // 초기 상태: 규격 존재 → 미입고(REGISTERED), 없음 → 경고(CAUTION)
      // 정확한 입고/미입고 구분은 아래 syncSpecsAfterUpload에서 재조정
      const status: "REGISTERED" | "CAUTION" = hasMatch(row.material, row.thickness, row.width, row.length)
        ? "REGISTERED"
        : "CAUTION";
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
    });

    const created = await prisma.drawingList.createMany({ data: rowsToInsert });

    // 입고 수량 기준으로 정확히 재조정
    const matchedSpecs = rowsToInsert
      .filter((r) => r.status === "REGISTERED")
      .map((r) => ({ material: r.material, thickness: r.thickness, width: r.width, length: r.length }));
    if (matchedSpecs.length > 0) {
      await syncSpecsAfterUpload(project.projectCode, matchedSpecs);
    }

    return NextResponse.json(
      { success: true, data: { count: created.count, warnings: result.errors } },
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
