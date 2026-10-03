export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { genBatchNo } from "@/lib/steel-batch-no";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { validateName } from "@/lib/validate-name";
import { classifyReceipt, applyReceipt, ReceiptConflict, type ReceiptKind } from "@/lib/invoice-receipt";

/**
 * 송장 스캔 입고 ② 확정 — POST { fileName, receivedAt: "YYYY-MM-DD", rows: [...], dryRun?, classifyOnly? }  (2026-10-02 · 10-03 개정)
 *
 * 재강사 목록으로 먼저 등록(REGISTERED)해 둔 강재를 송장대로 입고로 바꾼다 — 판정은 lib/invoice-receipt:
 *   입고(목록 판번호) / 입고 + 판번호 추가(목록에 판번호가 없던 재강사) / 목록에 없는 강재는 새로 등록하며 입고.
 *   이미 입고됐거나 절단·출고된 판번호가 들어 있으면 통째로 거절.
 * 화면 값을 믿지 않고 트랜잭션 안에서 다시 판정해 적용한다(그사이 다른 사람이 입고했으면 조건부 갱신에서 걸러 거절).
 * 판번호를 추가할 땐 그 강재의 업로드 묶음에 넣는다(묶음 삭제 시 같이 정리되게). 새 등록분은 새 묶음 하나.
 * sourceFile = "송장스캔(파일명)". PDF 자체는 저장하지 않는다.
 * classifyOnly=true: 판정만 돌려준다(화면에서 칸을 고친 뒤 [다시 대조]). dryRun=true: 끝까지 해 보고 되돌림.
 */

type Row = { vesselCode: string; material: string; thickness: number; width: number; length: number; heatNo: string; storageLocation?: string | null };

class Rollback extends Error { constructor(public result: unknown) { super("rollback"); } }

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const rows: Row[] = Array.isArray(b?.rows) ? b.rows : [];
    const fileName = String(b?.fileName ?? "").slice(0, 120) || "송장";
    const receivedAt = /^\d{4}-\d{2}-\d{2}$/.test(b?.receivedAt) ? new Date(b.receivedAt) : new Date();
    if (!rows.length) return NextResponse.json({ success: false, error: "입고할 행이 없습니다." }, { status: 400 });

    const items = rows.map(r => ({
      vesselCode: String(r.vesselCode ?? "").trim(),
      material: String(r.material ?? "").trim().toUpperCase(),
      thickness: Number(r.thickness), width: Number(r.width), length: Number(r.length),
      heatNo: String(r.heatNo ?? "").trim().toUpperCase(),
      storageLocation: String(r.storageLocation ?? "").trim() || null,
    }));

    if (b?.classifyOnly === true) {
      const d = await classifyReceipt(prisma, items);
      return NextResponse.json({ success: true, decisions: d });
    }

    for (const [i, it] of items.entries()) {
      const bad = !it.vesselCode ? "호선" : !it.material ? "재질" : !(it.thickness > 0) ? "두께" : !(it.width > 0) ? "폭" : !(it.length > 0) ? "길이" : !it.heatNo ? "판번호" : null;
      if (bad) return NextResponse.json({ success: false, error: `${i + 1}번째 행(${it.heatNo || "판번호 없음"})의 ${bad}이(가) 비어 있거나 잘못됐습니다.` }, { status: 400 });
      const err = validateName(it.vesselCode, "호선");
      if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });
    }
    const dupIn = items.map(i => i.heatNo).filter((h, i, a) => a.indexOf(h) !== i);
    if (dupIn.length) return NextResponse.json({ success: false, error: `같은 판번호가 두 번 들어 있습니다: ${[...new Set(dupIn)].join(", ")}` }, { status: 400 });

    const sourceFile = `송장스캔(${fileName})`;
    let result: { counts: Record<ReceiptKind, number>; newBatch: string | null };
    let synced: { vesselCode: string; material: string; thickness: number; width: number; length: number }[] = [];
    try {
      result = await prisma.$transaction(async (tx) => {
        const ds = await classifyReceipt(tx, items);   // 화면 값 말고 지금 DB 로 다시 판정
        const res = await applyReceipt(tx, items, ds, { receivedAt, sourceFile, genBatch: () => genBatchNo(tx) });
        synced = ds.map(d => ({ vesselCode: d.vesselCode, material: d.material, thickness: d.thickness, width: d.width, length: d.length }));
        if (b?.dryRun === true) throw new Rollback(res);
        return res;
      }, { maxWait: 5000, timeout: 30000 });
    } catch (e) {
      if (e instanceof ReceiptConflict) return NextResponse.json({ success: false, error: e.message }, { status: 409 });
      if (e instanceof Rollback) return NextResponse.json({ success: true, dryRun: true, ...(e.result as object) });
      throw e;
    }

    // 입고로 '대기' 도면이 '입고완료'로 바뀔 수 있다 — 엑셀 업로드·일괄 입고와 같은 동기화
    await syncDrawingListBySpecs(synced);

    return NextResponse.json({ success: true, count: items.length, ...result });
  } catch (e) {
    console.error("[POST /api/steel-plan/invoice-receive]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "입고 오류" }, { status: 500 });
  }
}
