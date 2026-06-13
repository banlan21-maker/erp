/**
 * 출고 예정 엑셀 업로드 → 자동 매칭
 *
 * 엑셀 양식 (헤더 1행 + 데이터)
 *   호선 | 재질 | 두께 | 폭 | 길이 | 중량 | 판번호 (선택)
 *
 * 매칭 알고리즘:
 *   1) 판번호가 있으면 SteelPlanHeat.heatNo 일치 + 사양 5개 일치 검색
 *      그 사양의 RECEIVED 인 SteelPlan 매칭 (1:1)
 *   2) 판번호가 없으면 사양 5개 매칭
 *      RECEIVED 인 SteelPlan 들 중 입고일(receivedAt) 빠른 것 우선 (FIFO)
 *
 *   결과 row 마다 status:
 *     MATCHED       — 매칭됨 (담을 수 있음)
 *     NOT_RECEIVED  — 사양 일치하는 SteelPlan 은 있지만 RECEIVED 가 아님
 *     NOT_FOUND     — 사양 일치하는 SteelPlan 자체 없음
 *     HEAT_NOT_FOUND— 판번호 적었지만 그 판번호의 SteelPlanHeat 없음
 *
 * POST multipart: file
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const TOL = 0.001;

interface ExcelRow {
  rowNo:       number;
  vesselCode:  string; // 선택 — 비면 사양만으로 매칭 (모든 호선 대상)
  material:    string;
  thickness:   number;
  width:       number;
  length:      number;
  weight:      number; // 비면 thickness × width × length × 7.85 / 1,000,000 으로 자동 계산
  heatNo?:     string;
}

interface MatchResult extends ExcelRow {
  status:        "MATCHED" | "NOT_RECEIVED" | "NOT_FOUND" | "HEAT_NOT_FOUND";
  reason?:       string;
  steelPlanId?:  string;
  steelPlanHeatId?: string;
}

function parseHeader(headers: unknown[]): { idx: Record<string, number>; missing: string[] } {
  const aliases: Record<string, string[]> = {
    vesselCode: ["호선", "호선번호", "vessel", "vessel code"],
    material:   ["재질", "material"],
    thickness:  ["두께", "thickness", "t"],
    width:      ["폭", "width", "w"],
    length:     ["길이", "length", "l"],
    weight:     ["중량", "weight", "무게"],
    heatNo:     ["판번호", "heat", "heat no", "heatno"],
  };
  const idx: Record<string, number> = {};
  for (const [key, names] of Object.entries(aliases)) {
    const found = headers.findIndex(h => {
      const s = String(h ?? "").trim().toLowerCase();
      return names.some(n => s === n.toLowerCase() || s.includes(n.toLowerCase()));
    });
    if (found >= 0) idx[key] = found;
  }
  // 필수 헤더: 재질·두께·폭·길이. (호선·중량·판번호는 선택)
  const required = ["material","thickness","width","length"] as const;
  const missing = required.filter(r => idx[r] === undefined);
  return { idx, missing };
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(/,/g, "").trim());
  return NaN;
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file 필드가 필요합니다." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb  = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ success: false, error: "엑셀에 시트가 없습니다." }, { status: 400 });
    }
    const sheet = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

    if (grid.length < 2) {
      return NextResponse.json({ success: false, error: "데이터 행이 없습니다." }, { status: 400 });
    }

    const { idx, missing } = parseHeader(grid[0]);
    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: `필수 컬럼 누락: ${missing.join(", ")} — 헤더에 (재질/두께/폭/길이) 가 반드시 포함되어야 합니다. (호선/중량/판번호는 선택)`,
      }, { status: 400 });
    }

    // 데이터 파싱
    const rows: ExcelRow[] = [];
    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      const vesselCode = idx.vesselCode !== undefined ? String(row[idx.vesselCode] ?? "").trim() : "";
      const material   = String(row[idx.material]   ?? "").trim();
      const thickness  = toNumber(row[idx.thickness]);
      const width      = toNumber(row[idx.width]);
      const length     = toNumber(row[idx.length]);
      const weightRaw  = idx.weight !== undefined ? toNumber(row[idx.weight]) : NaN;
      // 빈 행 skip — 재질·두께 모두 비어있으면 skip
      if (!material && !isFinite(thickness)) continue;
      // 필수: 재질·두께·폭·길이
      if (!material || !isFinite(thickness) || !isFinite(width) || !isFinite(length)) {
        return NextResponse.json({
          success: false,
          error: `${r + 1}행: 필수 값 누락 — 재질·두께·폭·길이 모두 있어야 합니다.`,
        }, { status: 400 });
      }
      // 중량: 비어있거나 0 이면 사양으로 자동 계산 (kg, 밀도 7.85)
      const weight = isFinite(weightRaw) && weightRaw > 0
        ? weightRaw
        : Math.round(thickness * width * length * 7.85 / 1_000_000 * 10) / 10;

      const heatNoRaw = idx.heatNo !== undefined ? String(row[idx.heatNo] ?? "").trim() : "";
      rows.push({
        rowNo: r + 1,
        vesselCode, material, thickness, width, length, weight,
        heatNo: heatNoRaw || undefined,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "유효한 데이터 행이 없습니다." }, { status: 400 });
    }

    // 매칭 — FIFO 보장 위해 같은 사양은 사용 표시
    const usedSteelPlanIds = new Set<string>();
    const results: MatchResult[] = [];

    for (const r of rows) {
      // 사양에 맞는 RECEIVED 인 SteelPlan 후보 — 호선 비면 호선 무관 매칭
      const planCandidates = await prisma.steelPlan.findMany({
        where: {
          ...(r.vesselCode ? { vesselCode: r.vesselCode } : {}),
          material:   r.material,
          thickness:  { gte: r.thickness - TOL, lte: r.thickness + TOL },
          width:      { gte: r.width     - TOL, lte: r.width     + TOL },
          length:     { gte: r.length    - TOL, lte: r.length    + TOL },
          NOT: { id: { in: Array.from(usedSteelPlanIds) } },
        },
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      });

      // 판번호가 있을 때 — 호선 비면 호선 무관 매칭
      if (r.heatNo) {
        const heat = await prisma.steelPlanHeat.findFirst({
          where: {
            ...(r.vesselCode ? { vesselCode: r.vesselCode } : {}),
            material:   r.material,
            thickness:  { gte: r.thickness - TOL, lte: r.thickness + TOL },
            width:      { gte: r.width     - TOL, lte: r.width     + TOL },
            length:     { gte: r.length    - TOL, lte: r.length    + TOL },
            heatNo:     r.heatNo,
          },
        });
        // 판번호 기록 자체가 없으면 HEAT_NOT_FOUND (사용자가 등록해야 함)
        // 다만 판번호 + 사양 매칭하는 SteelPlan(RECEIVED) 가 있으면 그건 담을 수 있음
        if (!heat && planCandidates.length === 0) {
          results.push({ ...r, status: "NOT_FOUND", reason: "사양 일치 자재 없음" });
          continue;
        }
        if (!heat && planCandidates.every(p => p.status !== "RECEIVED")) {
          results.push({ ...r, status: "NOT_RECEIVED", reason: "입고되지 않은 자재" });
          continue;
        }
        // 사양 일치 SteelPlan 이 있되 RECEIVED 인 것
        const planReceived = planCandidates.find(p => p.status === "RECEIVED");
        if (!planReceived) {
          results.push({ ...r, status: "NOT_RECEIVED", reason: "입고되지 않은 자재" });
          continue;
        }
        // 판번호 마스터에 그 판번호가 없는 경우 — heat 는 null 로 매칭, 사용자가 모달에서 직접입력 옵션
        usedSteelPlanIds.add(planReceived.id);
        results.push({
          ...r,
          status: heat ? "MATCHED" : "MATCHED",
          steelPlanId: planReceived.id,
          steelPlanHeatId: heat?.id ?? undefined,
          reason: heat ? undefined : "판번호 마스터에 없음 — 직접입력으로 자동 등록됨",
        });
        continue;
      }

      // 판번호 없음 — 사양만으로 매칭
      if (planCandidates.length === 0) {
        results.push({ ...r, status: "NOT_FOUND", reason: "사양 일치 자재 없음" });
        continue;
      }
      const planReceived = planCandidates.find(p => p.status === "RECEIVED");
      if (!planReceived) {
        results.push({ ...r, status: "NOT_RECEIVED", reason: "입고되지 않은 자재" });
        continue;
      }
      usedSteelPlanIds.add(planReceived.id);
      results.push({ ...r, status: "MATCHED", steelPlanId: planReceived.id });
    }

    const summary = {
      total:        results.length,
      matched:      results.filter(r => r.status === "MATCHED").length,
      notReceived:  results.filter(r => r.status === "NOT_RECEIVED").length,
      notFound:     results.filter(r => r.status === "NOT_FOUND").length,
      heatNotFound: results.filter(r => r.status === "HEAT_NOT_FOUND").length,
    };

    return NextResponse.json({ success: true, results, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "엑셀 처리 실패";
    console.error("[POST /api/shipments/excel-upload]", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
