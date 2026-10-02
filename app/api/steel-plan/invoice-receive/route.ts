export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { genBatchNo } from "@/lib/steel-batch-no";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";
import { validateName } from "@/lib/validate-name";

/**
 * 송장 스캔 입고 ② 확정 — POST { fileName, receivedAt: "YYYY-MM-DD", rows: [...], dryRun? }  (2026-10-02)
 *
 * 검수한 행을 한 묶음(uploadBatchNo)으로 등록한다 — 사무실이 송장을 보고 만들던
 * 「입고 LIST」 엑셀 업로드 + [일괄 입고]와 같은 결과를 한 번에:
 *   강재(SteelPlan) = 입고(RECEIVED) · 입고일 · 보관위치,  판번호(SteelPlanHeat) = 대기(WAITING).
 * 기존 [일괄 입고]는 사양만 보고 다른 묶음의 대기 강재를 집을 수 있어 쓰지 않는다 — 송장에 적힌 판만 새로 만든다.
 * sourceFile = "송장스캔(파일명)" — 어디서 들어왔는지 목록에서 보이게. PDF 자체는 저장하지 않는다.
 * 같은 판번호가 이미 있으면 통째로 거절(이중 입고 방지). dryRun=true 면 끝까지 해 보고 되돌린다(검증용).
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
    for (const [i, it] of items.entries()) {
      const bad = !it.vesselCode ? "호선" : !it.material ? "재질" : !(it.thickness > 0) ? "두께" : !(it.width > 0) ? "폭" : !(it.length > 0) ? "길이" : !it.heatNo ? "판번호" : null;
      if (bad) return NextResponse.json({ success: false, error: `${i + 1}번째 행(${it.heatNo || "판번호 없음"})의 ${bad}이(가) 비어 있거나 잘못됐습니다.` }, { status: 400 });
      const err = validateName(it.vesselCode, "호선");
      if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });
    }
    const dupIn = items.map(i => i.heatNo).filter((h, i, a) => a.indexOf(h) !== i);
    if (dupIn.length) return NextResponse.json({ success: false, error: `같은 판번호가 두 번 들어 있습니다: ${[...new Set(dupIn)].join(", ")}` }, { status: 400 });

    const sourceFile = `송장스캔(${fileName})`;
    let result: { uploadBatchNo: string; count: number };
    try {
      result = await prisma.$transaction(async (tx) => {
        const exist = await tx.steelPlanHeat.findMany({
          where: { heatNo: { in: items.map(i => i.heatNo), mode: "insensitive" } },
          select: { heatNo: true, uploadBatchNo: true },
        });
        if (exist.length) throw new Rollback({ conflict: exist.map(e => `${e.heatNo}(${e.uploadBatchNo ?? "-"})`) });

        const uploadBatchNo = await genBatchNo(tx);
        const created = await tx.steelPlan.createMany({
          data: items.map(i => ({
            vesselCode: i.vesselCode, material: i.material, thickness: i.thickness, width: i.width, length: i.length,
            status: "RECEIVED" as const, receivedAt, storageLocation: i.storageLocation, sourceFile, uploadBatchNo,
          })),
        });
        await tx.steelPlanHeat.createMany({
          data: items.map(i => ({
            vesselCode: i.vesselCode, material: i.material, thickness: i.thickness, width: i.width, length: i.length,
            heatNo: i.heatNo, sourceFile, uploadBatchNo,
          })),
        });
        const res = { uploadBatchNo, count: created.count };
        if (b?.dryRun === true) throw new Rollback({ dryRun: res });
        return res;
      });
    } catch (e) {
      if (e instanceof Rollback) {
        const r = e.result as { conflict?: string[]; dryRun?: unknown };
        if (r.conflict) return NextResponse.json({ success: false, error: `이미 등록된 판번호가 있어 입고하지 않았습니다: ${r.conflict.join(", ")}` }, { status: 409 });
        return NextResponse.json({ success: true, dryRun: true, ...(r.dryRun as object) });
      }
      throw e;
    }

    // 새 강재로 '주의' 도면이 풀릴 수 있다 — 엑셀 업로드와 같은 동기화
    await syncDrawingListBySpecs(items.map(i => ({ vesselCode: i.vesselCode, material: i.material, thickness: i.thickness, width: i.width, length: i.length })));

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[POST /api/steel-plan/invoice-receive]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "입고 오류" }, { status: 500 });
  }
}
