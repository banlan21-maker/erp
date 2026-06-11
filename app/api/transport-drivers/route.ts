import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TransportDriverType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const parseType = (v: string | null): TransportDriverType | undefined => {
  if (v === "REGULAR" || v === "CHARTER") return v;
  return undefined;
};

// GET /api/transport-drivers?type=REGULAR|CHARTER
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = parseType(searchParams.get("type"));

    const drivers = await prisma.transportDriver.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
      success: true,
      data: drivers.map(d => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "조회 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/transport-drivers
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = parseType(body?.type);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const vehicleNo = typeof body?.vehicleNo === "string" ? body.vehicleNo.trim() : "";
    const phoneNo   = typeof body?.phoneNo   === "string" ? body.phoneNo.trim()   : "";
    const memo      = typeof body?.memo      === "string" ? body.memo.trim()      : "";

    if (!type)         return NextResponse.json({ success: false, error: "운전자 종류(type)를 입력해주세요." }, { status: 400 });
    if (!name)         return NextResponse.json({ success: false, error: "운전자 이름을 입력해주세요." },        { status: 400 });

    const created = await prisma.transportDriver.create({
      data: {
        type,
        name,
        vehicleNo: type === "CHARTER" ? (vehicleNo || null) : null,
        phoneNo:   type === "CHARTER" ? (phoneNo   || null) : null,
        memo:      memo || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...created, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() },
    }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ success: false, error: "동일한 종류·이름의 운전자가 이미 등록되어 있습니다." }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "등록 실패";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
