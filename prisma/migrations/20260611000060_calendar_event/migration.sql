-- 랜딩 페이지 달력 — 간단 일정 메모
CREATE TABLE "CalendarEvent" (
    "id"        TEXT NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL,
    "registrar" TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarEvent_date_idx" ON "CalendarEvent"("date");
