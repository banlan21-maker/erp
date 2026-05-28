-- CreateTable
CREATE TABLE "DrivingLocation" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrivingLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DrivingLocation_name_key" ON "DrivingLocation"("name");

-- Seed: 기존 고정 위치 7곳
INSERT INTO "DrivingLocation" ("id", "name", "sortOrder", "createdAt") VALUES
  ('seed_loc_1', '진교',       1, CURRENT_TIMESTAMP),
  ('seed_loc_2', '삼정',       2, CURRENT_TIMESTAMP),
  ('seed_loc_3', '세림',       3, CURRENT_TIMESTAMP),
  ('seed_loc_4', '한국야나세', 4, CURRENT_TIMESTAMP),
  ('seed_loc_5', '통영조선소', 5, CURRENT_TIMESTAMP),
  ('seed_loc_6', '삼부TS',     6, CURRENT_TIMESTAMP),
  ('seed_loc_7', '함안공장',   7, CURRENT_TIMESTAMP);
