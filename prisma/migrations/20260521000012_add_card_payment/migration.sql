-- CreateTable
CREATE TABLE "CorporateCard" (
    "id"        TEXT NOT NULL,
    "cardNo"    TEXT NOT NULL,
    "label"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorporateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardUsage" (
    "id"        TEXT NOT NULL,
    "usedDate"  TEXT NOT NULL,
    "cardNo"    TEXT NOT NULL,
    "detail"    TEXT NOT NULL,
    "amount"    INTEGER NOT NULL,
    "userName"  TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "memo"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CardUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorporateCard_cardNo_key" ON "CorporateCard"("cardNo");

-- CreateIndex
CREATE INDEX "CardUsage_usedDate_idx" ON "CardUsage"("usedDate");

-- Seed: 기본 법인카드 4장
INSERT INTO "CorporateCard" ("id", "cardNo", "createdAt") VALUES
  ('seed_card_8219', '8219', CURRENT_TIMESTAMP),
  ('seed_card_0817', '0817', CURRENT_TIMESTAMP),
  ('seed_card_1239', '1239', CURRENT_TIMESTAMP),
  ('seed_card_9916', '9916', CURRENT_TIMESTAMP);
