export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/admin-auth";

// GET /api/admin/me — 현재 세션 사용자 (관리자 페이지 가드용)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ success: false }, { status: 401 });
  return NextResponse.json({
    success: true,
    user: { id: user.id, username: user.username, name: user.name, isAdmin: user.isAdmin, permissions: user.permissions },
  });
}
