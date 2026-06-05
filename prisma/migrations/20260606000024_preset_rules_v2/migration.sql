-- 절단도면 PDF 추출 프리셋 룰 v2
--  · detectKeywords 단순화 (양식 식별용 1개씩)
--  · negativeKeywords 도입 (양식 2 키워드 있을 때 양식 3 매칭 방지)
--  · drawingNo transform.tail 도입 (끝 N자리만 — NCP01, CNX01, CNK001)

-- 양식 1: 한국조선기술 NESTING (텍스트 PDF)
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["사용중량(Kg)"],
  "drawingNo":  { "label": "DWG NO",      "valuePattern": "[A-Z0-9]+NC[A-Z]\\d+", "transform": { "type": "tail", "length": 5 } },
  "partWeight": { "label": "사용중량(Kg)", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "markingLen": { "label": "Mark-Len(M)", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "cuttingLen": { "label": "Cut-Len(M)",  "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
}'::jsonb WHERE id = 'preset_hht_nesting';

-- 양식 2: TOTAL PART WEIGHT (OCR) — 도면번호 끝 5자리 (예: CNX01)
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  { "label": "DRAWING NO",       "valuePattern": "[A-Z0-9\\-]+", "transform": { "type": "tail", "length": 5 } },
  "partWeight": { "label": "TOTAL PART WEIGHT","valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "markingLen": { "label": "MARKING LEN",      "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "cuttingLen": { "label": "CUTTING LEN",      "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
}'::jsonb WHERE id = 'preset_nc_total_part_weight';

-- 양식 3: PART WEIGHT (OCR, TOTAL 없음) — 도면번호 끝 6자리 (예: CNK001)
UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords":  ["PART WEIGHT"],
  "negativeKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  { "label": "DRAWING NO",  "valuePattern": "[A-Z0-9]+", "transform": { "type": "tail", "length": 6 } },
  "partWeight": { "label": "PART WEIGHT", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "markingLen": { "label": "MARKING LEN", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
  "cuttingLen": { "label": "CUTTING LEN", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
}'::jsonb WHERE id = 'preset_nc_part_weight';
