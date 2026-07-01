-- 로그인/계정 (관리자 페이지). 최초 admin/admin 은 애플리케이션에서 시드.
CREATE TABLE "AppUser" (
  "id"           TEXT NOT NULL,
  "username"     TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name"         TEXT,
  "isAdmin"      BOOLEAN NOT NULL DEFAULT false,
  "permissions"  TEXT[] NOT NULL DEFAULT '{}',
  "sessionToken" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");
CREATE UNIQUE INDEX "AppUser_sessionToken_key" ON "AppUser"("sessionToken");
