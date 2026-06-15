-- 강재매칭: 업로드 사양 목록 저장 (강재전체목록과 매칭·재조회용)
CREATE TABLE "SteelMatchJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statuses" TEXT NOT NULL DEFAULT 'ALL',
    "specs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteelMatchJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SteelMatchJob_createdAt_idx" ON "SteelMatchJob"("createdAt");
