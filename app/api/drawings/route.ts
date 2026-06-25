import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseExcelBuffer, parseExcelBufferWithPreset } from "@/lib/excel-parser";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { syncProjectStatus } from "@/lib/sync-project-status";

// syncSpecsAfterUpload 함수는 통합 syncDrawingListBySpecs 로 대체됨 (lib/sync-drawing-spec.ts)

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
        include: {
          project:         { select: { id: true, projectCode: true, projectName: true } },
          assignedRemnant: { select: { width1: true, length1: true, width2: true, length2: true } },
        },
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
        include: { assignedRemnant: { select: { type: true, heatNo: true } } },
        orderBy: { createdAt: "asc" },
      });

      // 절단 진행중(STARTED/PAUSED)인 도면은 목록에서 제외 — 다른 장비에서 같은 도면 중복 작업 방지.
      // (도면 status 는 완료 시에만 WAITING→CUT 이라, 진행중에는 WAITING 으로 남아 목록에 노출되던 문제)
      // 행 id 뿐 아니라 도면번호(projectId+drawingNo)로도 매칭 — 같은 도면번호의 별개 행 중복도 차단
      // (완료 흐름이 projectId+drawingNo 키로 동작하므로 동일 키 사용). 돌발작업(isUrgent) 로그는 제외.
      const wIds = waitingRows.map(r => r.id);
      const wNos = waitingRows.map(r => r.drawingNo).filter((x): x is string => !!x);
      const activeLogs = await prisma.cuttingLog.findMany({
        where: {
          projectId, isUrgent: false, status: { in: ["STARTED", "PAUSED"] },
          OR: [{ drawingListId: { in: wIds } }, ...(wNos.length ? [{ drawingNo: { in: wNos } }] : [])],
        },
        select: { drawingListId: true, drawingNo: true },
      });
      const activeDrawIds = new Set(activeLogs.map(l => l.drawingListId).filter((x): x is string => !!x));
      const activeDrawNos = new Set(activeLogs.map(l => l.drawingNo).filter((x): x is string => !!x));

      const result = [];
      for (const row of waitingRows) {
        if (activeDrawIds.has(row.id) || (row.drawingNo && activeDrawNos.has(row.drawingNo))) continue;   // 절단 진행중 → 목록 제외
        // 등록잔재/현장잔재 사용 행 — assignedRemnantId가 있고 status=WAITING이면 이미 확정 상태
        const rowExt = row as typeof row & { assignedRemnantId?: string | null; alternateVesselCode?: string | null };
        if (rowExt.assignedRemnantId) {
          result.push(row);
          continue;
        }
        const projectCode    = project.projectCode;
        const blockCode      = row.block ?? "UNKNOWN";
        const newFmt         = `${projectCode}/${blockCode}`;
        const effectiveVessel = rowExt.alternateVesselCode?.trim() || projectCode;

        // 정규작업: '확정만 되어 있으면' 통과 — 출고 여부 무관
        // - vesselCode 필터: 호선 격리 (다른 호선의 동명 블록 매칭 방지)
        // - reservedFor 매칭: 신규 포맷("호선/블록") 또는 레거시 포맷("블록")
        // - status 필터 없음: 확정(reservedFor) 채워졌다는 것 자체가 RECEIVED 이상 의미
        const reserved = await prisma.steelPlan.findFirst({
          where: {
            vesselCode:  effectiveVessel,
            material:    row.material,
            thickness:   row.thickness,
            width:       row.width,
            length:      row.length,
            reservedFor: { in: [newFmt, blockCode] },
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

      // 행 정규화 (대체호선 포함) — 같은 시점에 effective vessel 결정
      type IncomingRow = {
        block?: string; drawingNo?: string; heatNo?: string;
        material: string; thickness: number; width: number; length: number;
        qty: number; steelWeight?: number | null; useWeight?: number | null;
        alternateVesselCode?: string | null;
      };
      const normalized = (rows as IncomingRow[]).map((r) => {
        const t = Number(r.thickness), w = Number(r.width), l = Number(r.length);
        const mat = r.material.trim().toUpperCase();
        const altVessel = r.alternateVesselCode?.trim() || null;
        const effectiveVessel = altVessel || project.projectCode;
        return { ...r, t, w, l, mat, altVessel, effectiveVessel };
      });

      // 강재입고관리 스펙 조회 — 본 호선 + 대체호선 전부 한 번에
      const vesselSet = new Set<string>([project.projectCode]);
      normalized.forEach(n => vesselSet.add(n.effectiveVessel));
      const steelPlans = await prisma.steelPlan.findMany({
        where: { vesselCode: { in: Array.from(vesselSet) } },
        select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
      });
      const hasMatch = (vessel: string, material: string, thickness: number, width: number, length: number) =>
        steelPlans.some(
          (sp) =>
            sp.vesselCode === vessel &&
            sp.material.trim().toLowerCase() === material.trim().toLowerCase() &&
            sp.thickness === thickness && sp.width === width && sp.length === length
        );

      const rowsToInsert = normalized.map((n) => {
        // 초기 상태: 행별 effectiveVessel 기준으로 매칭
        // 정확한 입고/미입고 구분은 아래 syncSpecsAfterUpload에서 재조정
        const status: "REGISTERED" | "CAUTION" = hasMatch(n.effectiveVessel, n.mat, n.t, n.w, n.l) ? "REGISTERED" : "CAUTION";
        return {
          projectId,
          block: n.block?.trim() || null,
          drawingNo: n.drawingNo?.trim() || null,
          heatNo: n.heatNo?.trim() || null,
          material: n.mat,
          thickness: n.t, width: n.w, length: n.l,
          qty: Math.round(Number(n.qty)),
          steelWeight: n.steelWeight != null && n.steelWeight !== 0 ? Number(n.steelWeight) : null,
          useWeight: n.useWeight != null && n.useWeight !== 0 ? Number(n.useWeight) : null,
          alternateVesselCode: n.altVessel,
          sourceFile: null,
          status,
        };
      });

      const created = await prisma.drawingList.createMany({ data: rowsToInsert });

      // 통합 sync — 신규 행의 spec 별로 재계산
      // alt vessel 사용한 행은 그 호선 기준으로, 일반 행은 본 호선 기준
      const specsToSync = rowsToInsert.map(r => ({
        vesselCode: r.alternateVesselCode || project.projectCode,
        material:   r.material,
        thickness:  r.thickness, width: r.width, length: r.length,
      }));
      if (specsToSync.length > 0) {
        await syncDrawingListBySpecs(specsToSync);
      }

      // 새 강재(미절단)가 추가되면 완료(COMPLETED)였던 블록도 다시 ACTIVE 로 복귀
      // — 안 하면 현장작업일보(ACTIVE 블록만 노출)에서 그 블록이 안 보여 작업 불가
      await syncProjectStatus(projectId);

      return NextResponse.json({ success: true, data: { count: created.count } }, { status: 201 });
    }

    // ── multipart: Excel 업로드 ──────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;
    const presetId = formData.get("presetId") as string | null;
    const storageLocation = formData.get("storageLocation") as string | null;
    const remnantsJson = formData.get("remnants") as string | null;
    const remnantsData: Array<{
      rowIndex: number;
      remnantNo: string;
      shape: string;
      width1: number;
      length1: number;
      width2?: number;
      length2?: number;
    }> = remnantsJson ? JSON.parse(remnantsJson) : [];

    const assignmentsJson = formData.get("assignments") as string | null;
    const assignmentsData: Array<{ rowIndex: number; remnantId: string }> =
      assignmentsJson ? JSON.parse(assignmentsJson) : [];
    // rowIndex → remnantId 맵
    const assignmentMap = new Map(assignmentsData.map(a => [a.rowIndex, a.remnantId]));

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

    const isPreview = new URL(request.url).searchParams.get("preview") === "true";

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

    // 미리보기 모드: DB 저장 없이 파싱 결과 반환
    if (isPreview) {
      return NextResponse.json({ success: true, preview: true, rows: result.rows, errors: result.errors });
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
      // 재질 정규화(트림 + 대문자) — 공백·대소문자 불일치로 인한 매칭 실패 방지
      const mat = row.material.trim().toUpperCase();
      // 초기 상태: 규격 존재 → 미입고(REGISTERED), 없음 → 경고(CAUTION)
      // 정확한 입고/미입고 구분은 아래 syncSpecsAfterUpload에서 재조정
      const status: "REGISTERED" | "CAUTION" = hasMatch(mat, row.thickness, row.width, row.length)
        ? "REGISTERED"
        : "CAUTION";
      return {
        projectId,
        block: row.block?.trim() || project.projectName,
        drawingNo: row.drawingNo,
        heatNo: row.heatNo,
        material: mat,
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

    // 잔재 연결 또는 잔재 지정이 필요한 경우 개별 create로 ID 추적
    let createdCount = 0;
    const createdRows: Array<{ id: string; thickness: number; material: string; block: string | null; drawingNo: string | null }> = [];

    const needIndividual = remnantsData.length > 0 || assignmentsData.length > 0;
    if (needIndividual) {
      for (let rowIdx = 0; rowIdx < rowsToInsert.length; rowIdx++) {
        const row = rowsToInsert[rowIdx];
        const assignedRemnantId = assignmentMap.get(rowIdx) ?? null;
        const dl = await prisma.drawingList.create({
          data: { ...row, assignedRemnantId },
        });
        createdRows.push({ id: dl.id, thickness: dl.thickness, material: dl.material, block: dl.block, drawingNo: dl.drawingNo });
        createdCount++;
      }
    } else {
      const created = await prisma.drawingList.createMany({ data: rowsToInsert });
      createdCount = created.count;
    }

    // 통합 sync — multipart 업로드는 alternateVesselCode 미지원이라 본 호선 기준
    const specsToSync = rowsToInsert.map(r => ({
      vesselCode: project.projectCode,
      material:   r.material,
      thickness:  r.thickness, width: r.width, length: r.length,
    }));
    if (specsToSync.length > 0) {
      await syncDrawingListBySpecs(specsToSync);
    }

    // 새 강재(미절단)가 추가되면 완료(COMPLETED)였던 블록도 다시 ACTIVE 로 복귀
    // — 안 하면 현장작업일보(ACTIVE 블록만 노출)에서 그 블록이 안 보여 작업 불가
    await syncProjectStatus(projectId);

    // 잔재 레코드 생성
    for (const rem of remnantsData) {
      const dlRow = createdRows[rem.rowIndex];
      if (!dlRow) continue;

      // hasRemnant 업데이트
      await prisma.drawingList.update({ where: { id: dlRow.id }, data: { hasRemnant: true } });

      // 잔재번호 자동채번
      const year = new Date().getFullYear();
      const prefix = `REM-${year}-`;
      const last = await prisma.remnant.findFirst({
        where: { remnantNo: { startsWith: prefix } },
        orderBy: { remnantNo: "desc" },
      });
      const seq = last ? parseInt(last.remnantNo.split("-")[2], 10) + 1 : 1;
      const autoNo = rem.remnantNo || `${prefix}${String(seq).padStart(3, "0")}`;

      // 중량 계산
      const t = dlRow.thickness;
      let w = 0;
      if (rem.shape === "RECTANGLE") {
        w = Math.round(t * rem.width1 * rem.length1 * 7.85 / 1_000_000 * 10) / 10;
      } else {
        const totalArea = rem.width1 * rem.length1;
        const cutArea = (rem.width2 ?? 0) * (rem.length2 ?? 0);
        w = Math.round(t * (totalArea - cutArea) * 7.85 / 1_000_000 * 10) / 10;
      }

      // 잔재사용 행에서 발생한 잔재는 사용된 등록잔재를 부모로 설정
      const parentRemnantId = assignmentMap.get(rem.rowIndex) ?? null;

      await prisma.remnant.create({
        data: {
          remnantNo: autoNo,
          type: "REGISTERED",
          shape: rem.shape as "RECTANGLE" | "L_SHAPE" | "IRREGULAR",
          material: dlRow.material,
          thickness: dlRow.thickness,
          weight: w,
          width1: rem.width1,
          length1: rem.length1,
          width2: rem.width2 ?? null,
          length2: rem.length2 ?? null,
          sourceProjectId: project.id,
          sourceBlock: dlRow.block,
          drawingNo: dlRow.drawingNo,   // 발생도면번호 — 정규작업 도면에서 등록잔재 생성 시 기록
          drawingListId: dlRow.id,
          parentRemnantId,
          registeredBy: "system",
          status: "IN_STOCK",
        },
      });
    }

    return NextResponse.json(
      { success: true, data: { count: createdCount, warnings: result.errors } },
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

    // 삭제 전: 1) 영향받는 spec 수집 2) SteelPlan reservedFor 해제 위한 블록 수집
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const allRows = await prisma.drawingList.findMany({
      where: { projectId },
      select: {
        material: true, thickness: true, width: true, length: true,
        block: true, alternateVesselCode: true, assignedRemnantId: true,
      },
    });

    if (project && allRows.length > 0) {
      const projectCode = project.projectCode;
      const blockCodes  = [...new Set(allRows.map(r => r.block ?? "UNKNOWN"))];
      const newFmtCodes = blockCodes.map(b => `${projectCode}/${b}`);

      // SteelPlan reservedFor 해제 — 본 프로젝트 호선/블록 매칭하는 것만
      await prisma.steelPlan.updateMany({
        where: {
          OR: [
            { reservedFor: { in: newFmtCodes } },
            { vesselCode: projectCode, reservedFor: { in: blockCodes } },
          ],
        },
        data: { reservedFor: null },
      });
      // Remnant reservedFor 도 해제
      const remnantIds = Array.from(new Set(
        allRows.map(r => r.assignedRemnantId).filter((x): x is string => !!x)
      ));
      if (remnantIds.length > 0) {
        await prisma.remnant.updateMany({
          where: { id: { in: remnantIds }, reservedFor: { in: [...newFmtCodes, ...blockCodes] } },
          data: { reservedFor: null },
        });
      }
    }

    const deleted = await prisma.drawingList.deleteMany({ where: { projectId } });

    // 삭제 후 sync — 영향받은 spec 전체
    if (project && allRows.length > 0) {
      const specs = allRows.map(r => ({
        vesselCode: r.alternateVesselCode?.trim() || project.projectCode,
        material:   r.material,
        thickness:  r.thickness, width: r.width, length: r.length,
      }));
      await syncDrawingListBySpecs(specs);
    }

    return NextResponse.json({ success: true, data: { count: deleted.count } });
  } catch (error) {
    console.error("[DELETE /api/drawings]", error);
    return NextResponse.json(
      { success: false, error: "전체 삭제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
