-- CreateTable
CREATE TABLE "MealSettlement" (
    "id"          TEXT NOT NULL,
    "factory"     TEXT NOT NULL,
    "month"       TEXT NOT NULL,
    "totalCount"  INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MealSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealSettlement_factory_month_key" ON "MealSettlement"("factory", "month");
