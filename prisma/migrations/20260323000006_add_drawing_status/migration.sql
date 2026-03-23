-- CreateEnum
CREATE TYPE "DrawingStatus" AS ENUM ('REGISTERED', 'WAITING', 'CUT');

-- AlterTable
ALTER TABLE "DrawingList" ADD COLUMN "status" "DrawingStatus" NOT NULL DEFAULT 'REGISTERED';
