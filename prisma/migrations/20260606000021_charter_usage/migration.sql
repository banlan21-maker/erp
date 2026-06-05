-- CreateTable
CREATE TABLE "CharterUsage" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT,
    "vehicleNo" TEXT,
    "items" TEXT,
    "departure" TEXT,
    "destination" TEXT,
    "departTime" TEXT,
    "cost" INTEGER,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharterUsage_pkey" PRIMARY KEY ("id")
);
