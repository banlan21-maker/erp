-- 양식 2 (TOTAL PART WEIGHT) 룰 v5 — 단위 옵션 + 검색범위 짧게 + drawingNo 정확화
--
-- v4 의 문제:
--  · 단위(Kg, M) 필수가 OCR 가 단위 못 잡은 페이지를 모두 빈칸으로 만듦
--  · drawingNo valuePattern [A-Z0-9\-]{8,} 가 "MATERIAL" 도 매칭 → tail 5 = "ERIAL"
--
-- v5 변경:
--  · 단위 옵션 ((?:\s*Kg)? 등) — 단위 있으면 정확도 ↑, 없어도 매칭됨
--  · searchRange: 40 — 라벨 직후 40자 안만 검색 (다른 라벨의 값 침범 방지)
--  · drawingNo: 영문+숫자 조합 필수 (dash 그리디) → MATERIAL 같은 영문만 단어 자동 배제
--    [A-Z]+\d+(?:[-\s][A-Z0-9]+)*  매칭 예: "KY1037-B16C-CNX01" 전체. tail 5 → CNX01

UPDATE "CuttingDrawingPreset" SET rules = '{
  "detectKeywords": ["TOTAL PART WEIGHT"],
  "drawingNo":  {
    "label": "DRAWING NO",
    "valuePattern": "[A-Z]+\\d+(?:[-\\s][A-Z0-9]+)*",
    "transform": { "type": "tail", "length": 5 },
    "searchRange": 50
  },
  "partWeight": {
    "label": "TOTAL PART WEIGHT",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*[Kk][Gg])?",
    "searchRange": 40
  },
  "markingLen": {
    "label": "MARKING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*M)?\\b",
    "searchRange": 40
  },
  "cuttingLen": {
    "label": "CUTTING LEN",
    "valuePattern": "([0-9]+(?:\\.[0-9]+)?)(?:\\s*M)?\\b",
    "searchRange": 40
  }
}'::jsonb WHERE id = 'preset_nc_total_part_weight';
