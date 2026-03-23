CREATE TABLE "ExcelPreset" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "dataStartRow"  INTEGER NOT NULL DEFAULT 2,
    "colBlock"      INTEGER,
    "colDrawingNo"  INTEGER,
    "colPorNo"      INTEGER,
    "colMaterial"   INTEGER,
    "colThickness"  INTEGER,
    "colWidth"      INTEGER,
    "colLength"     INTEGER,
    "colQty"        INTEGER,
    "colSteelWeight" INTEGER,
    "colUseWeight"  INTEGER,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExcelPreset_pkey" PRIMARY KEY ("id")
);
