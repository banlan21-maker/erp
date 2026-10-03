export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInvoice, plateKg, type OcrPage } from "@/lib/invoice-ocr";
import { classifyReceipt, RECEIPT_EXCLUDED } from "@/lib/invoice-receipt";

/**
 * 송장 스캔 입고 ① 판독 — POST multipart { file: PDF, rotation?: "0"|"90"|"180"|"270" }  (2026-10-02)
 *   rotation 은 자동 방향 판정이 틀렸을 때 사용자가 고르는 값(없으면 자동). 쪽마다 읽은 방향을 돌려준다.
 *
 * PDF 를 ocr 컨테이너로 보내 글자를 읽고(lib/invoice-ocr 로 행 맞춤), ERP 와 대조해 검수용 행을 돌려준다.
 * PDF 는 저장하지 않는다 — 메모리에서 OCR 로 넘기고 끝(종이 송장을 따로 보관, 사용자 결정).
 * 입고는 사람이 검수한 뒤 ② invoice-receive 에서.
 *
 * 행 확인사항(checks): 규격·재질·호선 못 읽음 / 송장 중량과 규격 계산 중량 차이(판독 실수 의심) / 같은 송장에 두 번.
 * 행 처리(kind, lib/invoice-receipt): 목록 판번호 입고 · 입고+판번호 추가 · 목록에 없음 · 이미 입고됨/절단·출고(기본 제외).
 *   판번호가 목록에 있으면 그 판번호의 호선·사양으로 채운다(목록 기준).
 */

const OCR_URL = process.env.OCR_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "PDF 파일을 선택하세요." }, { status: 400 });
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return NextResponse.json({ success: false, error: "PDF 파일만 판독할 수 있습니다." }, { status: 400 });
    if (file.size > 30 * 1024 * 1024) return NextResponse.json({ success: false, error: "PDF 가 너무 큽니다(30MB 이하)." }, { status: 400 });

    let ocr: { pages: OcrPage[]; seconds: number; error?: string };
    try {
      const rot = String(form.get("rotation") ?? "");
      const r = await fetch(`${OCR_URL}/ocr${/^(0|90|180|270)$/.test(rot) ? `?rotation=${rot}` : ""}`, {
        method: "POST", headers: { "Content-Type": "application/pdf" },
        body: Buffer.from(await file.arrayBuffer()),
        signal: AbortSignal.timeout(290_000),
      });
      ocr = await r.json();
      if (!r.ok) return NextResponse.json({ success: false, error: ocr.error ?? "판독 실패" }, { status: 400 });
    } catch (e) {
      console.error("[invoice-ocr] OCR 서버 연결 실패", e);
      return NextResponse.json({ success: false, error: "송장 판독 서버(ocr)에 연결할 수 없습니다. NAS 에서 ocr 컨테이너가 켜져 있는지 확인하세요." }, { status: 503 });
    }

    const { rows, bizNos, dates } = parseInvoice(ocr.pages);

    // 호선 — 숫자만 읽힌 경우(1026) 최근 1년 강재 호선 중 끝자리가 같은 것 하나면 그것
    const vessels = (await prisma.steelPlan.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 365 * 86400_000) } },
      distinct: ["vesselCode"], select: { vesselCode: true },
    })).map(v => v.vesselCode);
    const mapVessel = (hint: string | null) => {
      if (!hint) return null;
      if (vessels.includes(hint)) return hint;
      const digits = hint.replace(/\D/g, "");
      const cands = vessels.filter(v => v.replace(/\D/g, "") === digits);
      return cands.length === 1 ? cands[0] : /^KYTS-\d{4}$|^LB\d{4}$/.test(hint) ? hint : null;
    };
    // 행에서 못 찾으면 같은 페이지에서 가장 많이 나온 호선
    const pageVessel = new Map<number, string>();
    for (const p of new Set(rows.map(r => r.page))) {
      const cnt = new Map<string, number>();
      for (const r of rows) if (r.page === p) { const v = mapVessel(r.vesselHint); if (v) cnt.set(v, (cnt.get(v) ?? 0) + 1); }
      const top = [...cnt].sort((a, b) => b[1] - a[1])[0];
      if (top) pageVessel.set(p, top[0]);
    }

    const count = new Map<string, number>();
    for (const r of rows) count.set(r.heatNo, (count.get(r.heatNo) ?? 0) + 1);

    const withVessel = rows.map(r => ({ ...r, vesselCode: mapVessel(r.vesselHint) ?? pageVessel.get(r.page) ?? "" }));
    const decisions = await classifyReceipt(prisma, withVessel.map(r => ({
      vesselCode: r.vesselCode, material: r.material ?? "", thickness: r.thickness ?? 0, width: r.width ?? 0, length: r.length ?? 0, heatNo: r.heatNo,
    })));

    const out = withVessel.map((r, i) => {
      const checks: string[] = [];
      const d = decisions[i];
      const fromList = !!d.heatId;   // 판번호가 목록에 있으면 목록의 호선·사양으로
      const vesselCode = fromList ? d.vesselCode : r.vesselCode;
      if (!vesselCode) checks.push("호선 확인");
      if (r.thickness == null || r.width == null || r.length == null) checks.push("규격 못 읽음");
      if (!r.material) checks.push("재질 확인");
      if (r.weightKg && r.thickness && r.width && r.length) {
        const calc = plateKg(r.thickness, r.width, r.length);
        if (Math.abs(r.weightKg - calc) / calc > 0.08) checks.push(`중량 차이(송장 ${r.weightKg.toLocaleString()}kg · 계산 ${Math.round(calc).toLocaleString()}kg) — 규격 확인`);
      }
      if ((count.get(r.heatNo) ?? 0) > 1) checks.push("같은 송장에 두 번");
      return {
        ...r, vesselCode,
        ...(fromList ? { material: d.material, thickness: d.thickness, width: d.width, length: d.length } : {}),
        kind: d.kind, note: d.note, excluded: RECEIPT_EXCLUDED.includes(d.kind), checks,
      };
    });

    return NextResponse.json({
      success: true,
      rows: out, bizNos, dates, vessels: vessels.sort(),
      pages: ocr.pages.length, seconds: ocr.seconds, rotations: ocr.pages.map(p => p.rotation),
    });
  } catch (e) {
    console.error("[POST /api/steel-plan/invoice-ocr]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "판독 오류" }, { status: 500 });
  }
}
