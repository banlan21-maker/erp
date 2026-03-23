-- CreateTable
CREATE TABLE "Worker" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "nationality" TEXT,
    "birthDate"   TIMESTAMP(3),
    "phone"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);
