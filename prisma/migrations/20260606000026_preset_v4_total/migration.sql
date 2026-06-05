-- 양식 2 (TOTAL PART WEIGHT) 룰 v4 — 단위 포함 valuePattern 으로 정확도 강화
--
-- 변경:
--  · partWeight: 값 뒤 Kg 단위 필수 — 라벨 부근의 페이지번호/날짜 등 잘못된 숫자 제외
--  · markingLen/cuttingLen: 값 뒤 M 단위 필수 (단어 경계로 다른 글자와 분리)
--  · 모두 그룹 캡처 ([0-9...]) 사용 — extractField 의 pickMatch 가 그룹 1 우선 반환

UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  { "label": "DRAWING NO",       "valuePattern": "[A-Z0-9\\-]{8,}", "transform": { "type": "tail", "length": 5 } },
  "partWeight": { "label": "TOTAL PART WEIGHT","valuePattern": "([0-9]+(?:\\.[0-9]+)?)\\s*[Kk][Gg]" },
  "markingLen": { "label": "MARKING LEN",      "valuePattern": "([0-9]+(?:\\.[0-9]+)?)\\s*M\\b" },
  "cuttingLen": { "label": "CUTTING LEN",      "valuePattern": "([0-9]+(?:\\.[0-9]+)?)\\s*M\\b" }
}'::jsonb WHERE id = 'preset_nc_total_part_weight';
