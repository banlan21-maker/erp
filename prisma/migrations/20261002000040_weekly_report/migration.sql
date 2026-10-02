-- 주간보고 (업무관리 > 보고서) — 2026-10-02
CREATE TABLE "WeeklyReport" (
  "id"         TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo"   TIMESTAMP(3) NOT NULL,
  "writer"     TEXT,
  "writtenAt"  TIMESTAMP(3),
  "opsNotes"   JSONB,
  "plan"       JSONB,
  "report"     JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyReport_periodFrom_key" ON "WeeklyReport"("periodFrom");
