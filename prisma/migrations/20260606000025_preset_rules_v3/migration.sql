-- 절단도면 PDF 추출 프리셋 룰 v3
--  · 양식 2/3 도면번호 valuePattern 최소 길이 강화 — 짧은 영문 단어 (DATE, SCALE, MAT, REV) 자동 제외

-- 양식 2: TOTAL PART WEIGHT (OCR) — 도면번호 최소 8자 (KY1037-B16C-CNX01 같이 dash 포함 긴 토큰)
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  { "label": "DRAWING NO",       "valuePattern": "[A-Z0-9\\-]{8,}", "transform": { "type": "tail", "length": 5 } },
  "partWeight": { "label": "TOTAL PART WEIGHT","valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "markingLen": { "label": "MARKING LEN",      "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "cuttingLen": { "label": "CUTTING LEN",      "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
}'::jsonb WHERE id = 'preset_nc_total_part_weight';

-- 양식 3: PART WEIGHT (OCR, TOTAL 없음) — 도면번호 최소 10자 (1022BS40PHCNK001 같이 통짜 영숫자)
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords":  ["PART WEIGHT"],
  "negativeKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  { "label": "DRAWING NO",  "valuePattern": "[A-Z0-9]{10,}", "transform": { "type": "tail", "length": 6 } },
  "partWeight": { "label": "PART WEIGHT", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "markingLen": { "label": "MARKING LEN", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "cuttingLen": { "label": "CUTTING LEN", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
}'::jsonb WHERE id = 'preset_nc_part_weight';
