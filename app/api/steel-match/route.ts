export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Spec = { vesselCode: string; material: string; thickness: number; width: number; length: number };

// GET /api/steel-match — 매칭 작업 목록
export async function GET() {
  try {
    const jobs = await prisma.steelMatchJob.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({
      success: true,
      data: jobs.map(j => ({
        id: j.id,
        name: j.name,
        author: j.author,
        statuses: j.statuses,
        reservedFilter: j.reservedFilter,
        specCount: Array.isArray(j.specs) ? (j.specs as unknown[]).length : 0,
        createdAt: j.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/steel-match — 매칭 작업 생성 (업로드 사양 + 이름 + 대상 상태 저장)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    const author = body.author ? String(body.author).trim() : null;
    const statuses = (body.statuses ?? "ALL").toString();
    const reservedFilter = body.reservedFilter === "NONE" ? "NONE" : "ANY";
    const rawSpecs: unknown[] = Array.isArray(body.specs) ? body.specs : [];

    if (!name) {
      return NextResponse.json({ success: false, error: "매칭 이름을 입력하세요." }, { status: 400 });
    }
    if (!author) {
      return NextResponse.json({ success: false, error: "작성자를 입력하세요." }, { status: 400 });
    }

    const specs: Spec[] = rawSpecs
      .map((raw) => {
        const s = raw as Record<string, unknown>;
        return {
          vesselCode: s.vesselCode ? String(s.vesselCode).trim() : "",
          material:   String(s.material ?? "").trim(),
          thickness:  Number(s.thickness),
          width:      Number(s.width),
          length:     Number(s.length),
        };
      })
      .filter((s) => s.material && s.thickness && s.width && s.length);

    if (specs.length === 0) {
      return NextResponse.json({ success: false, error: "유효한 사양 행이 없습니다. (재질·두께·폭·길이 필요)" }, { status: 400 });
    }

    const job = await prisma.steelMatchJob.create({
      data: { name, author, statuses, reservedFilter, specs: specs as unknown as Prisma.InputJsonValue },
    });
    return NextResponse.json({ success: true, data: { id: job.id } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
