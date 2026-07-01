export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_COOKIE } from "@/lib/admin-auth";

// POST /api/admin/logout
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (user) await prisma.appUser.update({ where: { id: user.id }, data: { sessionToken: null } });
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
