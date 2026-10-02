export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { isYmd, ymdToDate, dateToYmd } from "@/lib/work-date";
import { buildAuto, buildOps, defaultPlan, defaultThisWeek, PLAN_ROWS, rangeLabel, shiftYmd7, type PlanKey, type PlanRow } from "@/lib/weekly-report";

/**
 * 주간보고 엑셀 — 사무실이 쓰던 양식(lib/report-templates/weekly-report.xlsx)에 값만 채운다.
 * 양식은 원본 두 파일에서 세 장을 글꼴·테두리·칸 크기·병합째 옮겨 만든 것이라, 받는 쪽에는 예전과 같은 모양으로 간다.
 * 합계·일절단량·평균 가동률은 양식 수식을 그대로 두고 열 때 다시 계산되게 한다.
 *
 * GET ?from&to   (저장 안 된 칸은 초안 값으로 채운다)
 */

const COLS = ["B", "C", "D", "E", "F", "G"];
const kor = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
    if (!isYmd(from) || !isYmd(to) || from > to) return NextResponse.json({ success: false, error: "기간이 올바르지 않습니다." }, { status: 400 });

    const saved = await prisma.weeklyReport.findUnique({ where: { periodFrom: ymdToDate(from) } });
    const ops = await buildOps(from, to, (saved?.opsNotes ?? {}) as Record<string, string>);
    const auto = await buildAuto(from, to, ops);
    const dPlan = defaultPlan(auto);
    const sPlan = (saved?.plan ?? null) as { rows?: Partial<Record<PlanKey, PlanRow>>; special?: string } | null;
    const sRep = (saved?.report ?? {}) as Record<string, string>;
    const writer = saved?.writer ?? "";
    const writtenAt = saved?.writtenAt ? dateToYmd(saved.writtenAt) : "";

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(process.cwd(), "lib/report-templates/weekly-report.xlsx"));
    wb.calcProperties.fullCalcOnLoad = true;

    // ── 1) 가동현황 ──
    const op = wb.getWorksheet("가동현황")!;
    op.getCell("A2").value = `(${kor(from)}  ~  ${kor(to)})`;
    ops.days.forEach((d, i) => { op.getCell(`${COLS[i]}3`).value = d.label; });
    ops.machines.forEach((m, mi) => {
      const base = 4 + mi * 4;
      op.getCell(`A${base}`).value = `[${mi + 1}호기] 가동시간(h)`;
      m.cells.forEach((c, i) => {
        const col = COLS[i];
        op.getCell(`${col}${base}`).value = c.runH || null;
        op.getCell(`${col}${base + 1}`).value = c.tons || null;
        op.getCell(`${col}${base + 2}`).value = c.stopH || null;
        op.getCell(`${col}${base + 3}`).value = c.autoNote || null;
      });
    });
    op.getCell("A22").value = "※ 가동률 = 실가동시간 ÷ (실가동시간 + 미가동시간) · 작업일보 기준, 미가동 = 장비고장·도면변경·소모품교체·기타 (퇴근/야간이월 제외)";

    // ── 2) 주간업무계획표 ──
    const pl = wb.getWorksheet("주간업무계획표")!;
    pl.getCell("C5").value = `${kor(from)} ~ ${kor(to)}`;
    pl.getCell("C6").value = `${writer || "    "}  /  ${writtenAt ? kor(writtenAt) : "    "}`;
    for (const r of PLAN_ROWS) {
      const v = sPlan?.rows?.[r.key] ?? dPlan[r.key];
      pl.getCell(`C${r.row}`).value = v.now || null;
      pl.getCell(`D${r.row}`).value = v.next || null;
      pl.getCell(`E${r.row}`).value = v.note || null;
      for (const c of ["C", "D", "E"]) pl.getCell(`${c}${r.row}`).alignment = { wrapText: true, vertical: "middle" };
    }
    if (sPlan?.special) {
      pl.mergeCells("A21:E24");
      const c = pl.getCell("A21");
      c.value = sPlan.special;
      c.alignment = { wrapText: true, vertical: "top" };
    }

    // ── 3) 업무보고 ──
    const rp = wb.getWorksheet("업무보고")!;
    rp.getCell("A2").value = writtenAt || null;
    rp.getCell("L2").value = writer || null;
    rp.getCell("A3").value = `금 주 실 적 (${sRep.thisRange ?? rangeLabel(from, to)})`;
    rp.getCell("H3").value = `차 주 계 획 (${sRep.nextRange ?? rangeLabel(shiftYmd7(from, 7), shiftYmd7(to, 7))})`;
    rp.getCell("A4").value = sRep.thisWeek ?? defaultThisWeek(auto);
    rp.getCell("H4").value = sRep.nextWeek ?? null;
    rp.getCell("A15").value = sRep.problems ?? null;
    rp.getCell("H15").value = sRep.requests ?? null;
    for (const c of ["A4", "H4", "A15", "H15"]) rp.getCell(c).alignment = { wrapText: true, vertical: "top" };

    const buf = await wb.xlsx.writeBuffer();
    const name = `주간업무보고_${from}~${to}.xlsx`;
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    console.error("[GET /api/weekly-report/excel]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "엑셀 생성 오류" }, { status: 500 });
  }
}
