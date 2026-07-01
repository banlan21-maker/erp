/**
 * 관리자/계정 인증 — 로그인 없이 운영하던 시스템에 도입한 최소 세션.
 *  - 비밀번호: Node 내장 crypto scrypt("salt:hash") 해싱 (외부 의존성 없음)
 *  - 세션: 로그인 시 랜덤 토큰을 AppUser.sessionToken 에 저장 + httpOnly 쿠키
 *  - 최초 admin/admin 계정 자동 시드
 * ⚠ 차후 정식 로그인 환경 구성 시 세션/권한 강화 예정.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const ADMIN_COOKIE = "erp_session";

/** 접근 파트 권한 키 (랜딩 상단메뉴와 동일) */
export const PERMISSION_KEYS = ["cutpart", "supply", "management", "work"] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = (stored ?? "").split(":");
  if (!salt || !hash) return false;
  const calc = scryptSync(pw, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** admin/admin 계정이 없으면 생성 (최초 1회) */
export async function ensureAdminSeed() {
  const existing = await prisma.appUser.findUnique({ where: { username: "admin" }, select: { id: true } });
  if (existing) return;
  try {
    await prisma.appUser.create({
      data: {
        username: "admin",
        passwordHash: hashPassword("admin"),
        name: "관리자",
        isAdmin: true,
        permissions: [...PERMISSION_KEYS],
      },
    });
  } catch { /* 동시 시드 충돌 무시 */ }
}

/** 쿠키 세션 토큰 → 로그인 사용자 (없으면 null) */
export async function getSessionUser(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return prisma.appUser.findUnique({ where: { sessionToken: token } });
}
