-- porNo → heatNo 컬럼 이름 변경

ALTER TABLE "DrawingList" RENAME COLUMN "porNo" TO "heatNo";

ALTER TABLE "CuttingLog" RENAME COLUMN "porNo" TO "heatNo";

ALTER TABLE "ExcelPreset" RENAME COLUMN "colPorNo" TO "colHeatNo";
