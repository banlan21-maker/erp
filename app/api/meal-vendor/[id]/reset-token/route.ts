import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updated = await prisma.mealVendor.update({
      where: { id },
      data: { token: randomUUID().replace(/-/g, "") },
    });
    return NextResponse.json({ success: true, data: { token: updated.token } });
  } catch (error) {
    console.error("[POST reset-token]", error);
    return NextResponse.json({ success: false, error: "토큰 재생성 오류" }, { status: 500 });
  }
}
