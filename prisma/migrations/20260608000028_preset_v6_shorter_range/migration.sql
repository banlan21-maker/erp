-- 프리셋 룰 v6 — searchRange 단축 (다른 라벨 값 침범 방지)
--
-- 기존: partWeight/markingLen/cuttingLen 40, drawingNo 50
-- 변경: 값 필드 20 (실제 "1459.5 Kg" = 9자, "0.0 M" = 5자 - 충분)
--      drawingNo 30 (실제 "KY1037-B16C-CNX01" = 17자 + 공백 여유)
--
-- 이유: 40자 가 "MARKING LEN" 다음 라벨 (예: "MARKING IDLE") 의 값까지 범위에 포함되어
-- 잘못된 매칭 위험. 20자로 줄이면 "라벨 + 값 + 단위" 까지만 잡고 다음 라벨 침범 안 함.

-- 양식 2: TOTAL PART WEIGHT
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  {
    "label": "DRAWING NO",
    "valuePattern": "[A-Z]+\\d+(?:[-\\s][A-Z0-9]+)*",
    "transform": { "type": "tail", "length": 5 },
    "searchRange": 30
  },
  "partWeight": {
    "label": "TOTAL PART WEIGHT",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*[Kk][Gg])?",
    "searchRange": 20
  },
  "markingLen": {
    "label": "MARKING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*M)?\\b",
    "searchRange": 20
  },
  "cuttingLen": {
    "label": "CUTTING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*M)?\\b",
    "searchRange": 20
  }
}'::jsonb WHERE id = 'preset_nc_total_part_weight';

-- 양식 3: PART WEIGHT (TOTAL 없음)
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords":  ["PART WEIGHT"],
  "negativeKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  {
    "label": "DRAWING NO",
    "valuePattern": "[A-Z0-9]{10,}",
    "transform": { "type": "tail", "length": 6 },
    "searchRange": 30
  },
  "partWeight": {
    "label": "PART WEIGHT",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*[Kk][Gg])?",
    "searchRange": 20
  },
  "markingLen": {
    "label": "MARKING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*M)?\\b",
    "searchRange": 20
  },
  "cuttingLen": {
    "label": "CUTTING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*M)?\\b",
    "searchRange": 20
  }
}'::jsonb WHERE id = 'preset_nc_part_weight';

-- 양식 1: 한국조선기술 NESTING (텍스트 PDF) — 좌표 매칭 우선이라 영향 적지만 일관성 유지
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["사용중량(Kg)"],
  "drawingNo":  { "label": "DWG NO",      "valuePattern": "[A-Z0-9]+NC[A-Z]\\d+", "transform": { "type": "tail", "length": 5 }, "searchRange": 30 },
  "partWeight": { "label": "사용중량(Kg)", "valuePattern": "[0-9]+(?:\\.[0-9]+)?", "searchRange": 20 },
  "markingLen": { "label": "Mark-Len(M)", "valuePattern": "[0-9]+(?:\\.[0-9]+)?", "searchRange": 20 },
  "cuttingLen": { "label": "Cut-Len(M)",  "valuePattern": "[0-9]+(?:\\.[0-9]+)?", "searchRange": 20 }
}'::jsonb WHERE id = 'preset_hht_nesting';
