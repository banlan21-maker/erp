/**
 * 철판 입고송장 OCR 결과 해석 (2026-10-02)
 *
 * ocr 컨테이너(ocr/server.py)가 돌려준 글자 상자들을 송장 '행'으로 맞춘다.
 * 업체마다 양식이 달라(제일테크노스·세림·한리TC …) 칸 위치를 외우지 않고, 값의 모양으로 찾는다:
 *   판번호  B62839101 · PC47594901 · PP79353504   (영문 1~2 + 숫자 7~8)
 *   규격    12x1501x7700 · 10.5*2160*12060 · 9X1660X8670  — 칸이 나뉜 양식(세림)은 판번호 오른쪽 숫자 3개
 *   재질    A · KR/A · AH32 · KR/AH36 …
 *   호선    KYTS-1026 · KYTS/1022 · KYTS/0/KYTS-1026 GE-B · (사용호선 칸) 1026
 *   중량    1,089 · 2.147(톤) · 933 — 판독 검증용(규격으로 계산한 중량과 비교)
 * 판번호 한 줄 = 철판 한 장. 같은 줄은 '세로 위치가 비슷한 상자들'(스캔 방향은 서버가 바로 세워 줌).
 *
 * 샘플 4장(55장) 시험: 판번호 55/55, 규격·재질 짝 55/55 가 ERP 사양과 일치.
 */

export type OcrItem = { t: string; x: number; y: number; w: number; h: number; s: number };
export type OcrPage = { rotation: number; width: number; height: number; items: OcrItem[] };

export type ParsedRow = {
  page: number;
  heatNo: string;
  material: string | null;
  thickness: number | null;
  width: number | null;
  length: number | null;
  weightKg: number | null;      // 송장에 적힌 중량(있으면)
  vesselHint: string | null;    // "KYTS-1026" 또는 숫자만 "1026"
  line: string;                 // 같은 줄 원문(확인용)
};

const HEAT = /(?<![A-Z0-9])([A-Z]{1,2}\d{7,8})(?![0-9])/;
const SPEC = /(\d{1,2}(?:\.\d)?)[xX*×](\d{3,4})[xX*×](\d{3,5})/;
const MAT = /^(?:KR\/?)?(A|B|D|E|AH32|AH36|DH32|DH36|EH32|EH36)$/;
const THICK = /^\d{1,2}(?:\.\d)?$/;
const DIM = /^\d{1,2},?\d{3}$|^\d{4,5}$/;
const WEIGHT = /^\d{1,2}[,.]\d{3}$|^\d{3,4}$/;
const BIZ = /\d{3}-\d{2}-\d{5}/g;
const DATE = /(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/;

const clean = (s: string) => s.replace(/\s+/g, "");
const numOf = (s: string) => Number(s.replace(/,/g, ""));
export const plateKg = (t: number, w: number, l: number) => (t * w * l * 7.85) / 1_000_000;

function vesselIn(text: string): string | null {
  const u = text.toUpperCase();
  const all = [...u.matchAll(/KYTS\W{0,3}(?:0\W{0,2}KYTS\W?)?(\d{4})/g)];
  if (all.length) return `KYTS-${all.at(-1)![1]}`;
  const lb = u.match(/LB\W?(\d{4})/);
  if (lb) return `LB${lb[1]}`;
  return null;
}

export function parseInvoice(pages: OcrPage[]): { rows: ParsedRow[]; bizNos: string[]; dates: string[] } {
  const rows: ParsedRow[] = [];
  const bizNos = new Set<string>();
  const dates = new Set<string>();

  pages.forEach((pg, pi) => {
    const items = pg.items.map(it => ({ ...it, c: clean(it.t) }));
    for (const it of items) {
      for (const m of it.c.matchAll(BIZ)) bizNos.add(m[0]);
      const d = it.t.match(DATE);
      if (d) dates.add(`${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`);
    }
    const seen = new Set<string>();
    for (const it of items) {
      const hm = it.c.toUpperCase().match(HEAT);
      if (!hm) continue;
      // 사업자번호·전화번호 조각 같은 숫자열은 판번호가 아니다 — 영문 머리가 있어야 하고 이미 HEAT 가 보장
      const heatNo = hm[1];
      const tol = Math.max(it.h, 12) * 0.6;
      const same = items.filter(b => Math.abs(b.y - it.y) < tol).sort((a, b) => a.x - b.x);

      let thickness: number | null = null, width: number | null = null, length: number | null = null, specX = it.x;
      const sb = same.find(b => SPEC.test(b.c));
      if (sb) {
        const [, t, w, l] = sb.c.match(SPEC)!;
        thickness = Number(t); width = Number(w); length = Number(l); specX = sb.x;
      } else {
        // 칸이 나뉜 양식: 판번호 오른쪽에서 두께(1~2자리) → 폭 → 길이
        const right = same.filter(b => b.x > it.x);
        const ti = right.findIndex(b => THICK.test(b.c));
        if (ti >= 0) {
          const dims = right.slice(ti + 1).filter(b => DIM.test(b.c));
          if (dims.length >= 2) {
            thickness = Number(right[ti].c); width = numOf(dims[0].c); length = numOf(dims[1].c); specX = dims[1].x;
          }
        }
      }

      const matBox = same.find(b => MAT.test(b.c.toUpperCase()));
      const material = matBox ? matBox.c.toUpperCase().match(MAT)![1] : null;

      // 중량: 규격 오른쪽의 첫 '중량 모양' 숫자 (수량 1 은 모양에서 걸러짐). 톤 표기(2.147)도 kg 로.
      let weightKg: number | null = null;
      const wb = same.find(b => b.x > specX && WEIGHT.test(b.c) && !(length && numOf(b.c) === length) && !(width && numOf(b.c) === width));
      if (wb) { const v = Number(wb.c.replace(/[,.]/g, "")); if (v >= 100) weightKg = v; }

      const line = same.map(b => b.t).join(" ");
      let vesselHint = vesselIn(line);
      if (!vesselHint) {   // 사용호선 칸에 숫자만(1026) — 서버가 아는 호선과 맞춘다
        const four = same.find(b => /^\d{4}$/.test(b.c) && b.x !== it.x && numOf(b.c) !== width && numOf(b.c) !== length);
        if (four) vesselHint = four.c;
      }

      const key = `${heatNo}`;
      if (seen.has(key)) continue;   // 같은 상자가 두 번 잡히는 경우
      seen.add(key);
      rows.push({ page: pi + 1, heatNo, material, thickness, width, length, weightKg, vesselHint, line });
    }
  });
  return { rows, bizNos: [...bizNos], dates: [...dates].sort() };
}
