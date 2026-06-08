-- 양식 2 (TOTAL PART WEIGHT) v7 — 사용자 명시 디테일 규칙 적용
--
-- 변경 (양식 2 만):
--  1) detectKeywords 에 "PLATE N/C CUTTING PLAN" 추가
--     → TOTAL PART WEIGHT 가 OCR 에서 깨졌어도 큰 제목으로 데이터 페이지 인식
--  2) drawingNo 정규식 = DRAWING NO 직후 두 번째 "-" 와 "(" 사이
--     예: "KY1037-B16C-CNX01 (1/2)" → CNX01
--     정규식: -[^-]+-([^-(]+?)\s*\(
--     transform tail 제거 (정규식이 이미 끝 토큰만 캡처)
--  3) partWeight: 단위 Kg 필수 (1459.5 Kg 의 1459.5)
--  4) markingLen/cuttingLen: 단위 M 필수 (0.0 M 의 0.0)
--
-- 양식 1, 3 은 v6 그대로 유지.

UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["TOTAL PART WEIGHT", "PLATE N/C CUTTING PLAN"],
  "drawingNo":  {
    "label": "DRAWING NO",
    "valuePattern": "-[^-]+-([^-(]+?)\\s*\\(",
    "searchRange": 35
  },
  "partWeight": {
    "label": "TOTAL PART WEIGHT",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)\\s*[Kk][Gg]",
    "searchRange": 20
  },
  "markingLen": {
    "label": "MARKING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)\\s*M\\b",
    "searchRange": 20
  },
  "cuttingLen": {
    "label": "CUTTING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)\\s*M\\b",
    "searchRange": 20
  }
}'::jsonb WHERE id = 'preset_nc_total_part_weight';
