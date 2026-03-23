-- CuttingStatus enum 추가
CREATE TYPE "CuttingStatus" AS ENUM ('STARTED', 'COMPLETED');

-- 절단 작업일보 테이블 생성
CREATE TABLE "CuttingLog" (
    "id"          TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "projectId"   TEXT,
    "porNo"       TEXT,
    "material"    TEXT,
    "thickness"   DOUBLE PRECISION,
    "operator"    TEXT NOT NULL,
    "status"      "CuttingStatus" NOT NULL DEFAULT 'STARTED',
    "startAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt"       TIMESTAMP(3),
    "memo"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuttingLog_pkey" PRIMARY KEY ("id")
);

-- Project → CuttingLog 관계
ALTER TABLE "CuttingLog"
  ADD CONSTRAINT "CuttingLog_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Equipment → CuttingLog 관계
ALTER TABLE "CuttingLog"
  ADD CONSTRAINT "CuttingLog_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
