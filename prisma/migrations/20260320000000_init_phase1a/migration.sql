-- Phase 1-A 초기 마이그레이션
-- CNC 절단 ERP: 프로젝트, 강재리스트, 작업지시, 장비 테이블 생성

-- Enum 타입 생성
CREATE TYPE "EquipmentType" AS ENUM ('PLASMA', 'GAS');
CREATE TYPE "EquipmentStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');
CREATE TYPE "ProjectType" AS ENUM ('A', 'B');
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ON_HOLD');
CREATE TYPE "WorkOrderStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- 장비 마스터 테이블
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EquipmentType" NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastInspection" TIMESTAMP(3),
    "nextInspection" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- 호선(프로젝트) 마스터 테이블
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "client" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- 강재리스트 테이블
CREATE TABLE "DrawingList" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "block" TEXT,
    "drawingNo" TEXT,
    "porNo" TEXT,
    "material" TEXT NOT NULL,
    "thickness" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "qty" INTEGER NOT NULL,
    "steelWeight" DOUBLE PRECISION,
    "useWeight" DOUBLE PRECISION,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingList_pkey" PRIMARY KEY ("id")
);

-- 작업지시 테이블
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "drawingListId" TEXT,
    "equipmentId" TEXT,
    "orderNo" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "assignedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- 유니크 제약
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");
CREATE UNIQUE INDEX "WorkOrder_orderNo_key" ON "WorkOrder"("orderNo");

-- 외래키 제약
ALTER TABLE "DrawingList" ADD CONSTRAINT "DrawingList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_drawingListId_fkey" FOREIGN KEY ("drawingListId") REFERENCES "DrawingList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 기본 장비 데이터 (플라즈마 4대 + 가스 1대)
INSERT INTO "Equipment" ("id", "name", "type", "status", "createdAt", "updatedAt") VALUES
    ('eq-plasma-01', '플라즈마 1호기', 'PLASMA', 'ACTIVE', NOW(), NOW()),
    ('eq-plasma-02', '플라즈마 2호기', 'PLASMA', 'ACTIVE', NOW(), NOW()),
    ('eq-plasma-03', '플라즈마 3호기', 'PLASMA', 'ACTIVE', NOW(), NOW()),
    ('eq-plasma-04', '플라즈마 4호기', 'PLASMA', 'ACTIVE', NOW(), NOW()),
    ('eq-gas-01', '가스 절단기 1호기', 'GAS', 'ACTIVE', NOW(), NOW());
