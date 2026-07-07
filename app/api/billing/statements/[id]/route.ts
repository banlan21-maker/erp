export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcLineAmount, calcVat, round0 } from "@/lib/billing";

// GET /api/billing/statements/[id] — 상세 (client + items)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await prisma.billingStatement.findUnique({
      where: { id },
      include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!data) return NextResponse.json({ success: false, error: "기성청구를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

type ItemIn = {
  category?: string; itemDate?: string | null; hoNo?: string | null; block?: string | null; description?: string;
  qty?: number | null; weight?: number | null; unitPrice?: number | null; amount?: number | null;
};
const CATS = ["MAIN", "ADDON", "TRANSPORT", "ETC"];

// PATCH /api/billing/statements/[id] — 필드 + 라인 전체 교체 + 합계 재계산
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json();
    const existing = await prisma.billingStatement.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "기성청구를 찾을 수 없습니다." }, { status: 404 });

    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const head: Record<string, unknown> = {};
    if (b?.title !== undefined)  head.title = String(b.title).trim() || "기성청구서";
    if (b?.ym !== undefined && /^\d{4}-\d{2}$/.test(b.ym)) head.ym = b.ym;
    if (b?.status !== undefined) head.status = b.status === "ISSUED" ? "ISSUED" : "DRAFT";
    if (b?.memo !== undefined)   head.memo = String(b.memo).trim() || null;
    if (b?.writer !== undefined) head.writer = String(b.writer).trim() || null;
    if (b?.senderDate !== undefined) head.senderDate = String(b.senderDate).trim() || null;
    if (b?.bomCount !== undefined) head.bomCount = Math.max(0, parseInt(b.bomCount) || 0);
    if (b?.prevBalance !== undefined) head.prevBalance = num(b.prevBalance);
    if (b?.deposit !== undefined)     head.deposit = num(b.deposit);

    const hasItems = Array.isArray(b?.items);
    const prepared = hasItems ? (b.items as ItemIn[])
      .filter(it => (it?.description ?? "").trim() || it?.weight || it?.amount || it?.unitPrice)
      .map((it, i) => {
        const amount = calcLineAmount({ weight: it.weight, qty: it.qty, unitPrice: it.unitPrice, amount: it.amount });
        return {
          category: CATS.includes(String(it.category)) ? String(it.category) as "MAIN" : "MAIN",
          itemDate: it.itemDate?.toString().trim() || null,
          hoNo: it.hoNo?.toString().trim() || null,
          block: it.block?.toString().trim() || null,
          description: String(it.description ?? "").trim(),
          qty: it.qty != null ? num(it.qty) : null,
          weight: it.weight != null ? num(it.weight) : null,
          unitPrice: it.unitPrice != null ? num(it.unitPrice) : null,
          amount,
          vatAmount: calcVat(amount),
          sortOrder: i,
        };
      }) : null;

    const result = await prisma.$transaction(async (tx) => {
      if (prepared) {
        await tx.billingItem.deleteMany({ where: { statementId: id } });
        if (prepared.length) await tx.billingItem.createMany({ data: prepared.map(p => ({ ...p, statementId: id })) });
      }
      // 합계 재계산 (교체된 라인 또는 기존 라인 기준)
      const items = prepared ?? await tx.billingItem.findMany({ where: { statementId: id } });
      const supplyAmount = round0(items.reduce((s, it) => s + (it.amount || 0), 0));
      const vat = round0(items.reduce((s, it) => s + (it.vatAmount || 0), 0));
      const total = supplyAmount + vat;
      const prevBalance = head.prevBalance !== undefined ? Number(head.prevBalance) : existing.prevBalance;
      const deposit = head.deposit !== undefined ? Number(head.deposit) : existing.deposit;
      const balance = round0(prevBalance + total - deposit);

      return tx.billingStatement.update({
        where: { id },
        data: { ...head, supplyAmount, vat, total, balance },
        include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
      });
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/billing/statements/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.billingStatement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
