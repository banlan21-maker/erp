-- 기성 표지(기성요청서): 작성자 + 발신일자 + 상세내역 부수, 작성자 마스터
ALTER TABLE "BillingStatement" ADD COLUMN "writer"     TEXT;
ALTER TABLE "BillingStatement" ADD COLUMN "senderDate" TEXT;
ALTER TABLE "BillingStatement" ADD COLUMN "bomCount"   INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "BillingAuthor" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "title"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingAuthor_pkey" PRIMARY KEY ("id")
);
