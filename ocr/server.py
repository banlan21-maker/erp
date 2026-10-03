"""
송장 OCR 서버 — ERP(app) 전용 내부 서비스 (2026-10-02)

철판 입고송장 스캔 PDF 를 받아 페이지마다 글자 상자(문자열 + 위치)를 돌려준다.
표 해석(판번호·규격 줄 맞추기)과 ERP 대조는 app 쪽(lib/invoice-ocr.ts)이 한다 — 여기는 읽기만.

- 엔진: RapidOCR (PaddleOCR PP-OCRv6 small 모델을 ONNX 로, CPU 전용). 모델은 패키지에 들어 있어 인터넷 불필요.
  한글은 못 읽지만 필요한 값(판번호·규격·재질·호선·사업자번호·날짜)은 모두 영문·숫자다.
- 스캔이 옆으로 누운 경우가 많다(샘플 4장 모두 90°) — 0°/90°/270° 중 판번호·규격이 가장 많이 잡히는 방향을 쓴다.
- NAS(펜티엄 8505 · 램 7.5GB) 기준: 한 번에 하나씩만 처리(락), 스레드 OCR_THREADS(기본 2). 최대 약 1GB.
- PDF 는 메모리에서만 쓰고 저장하지 않는다 (종이 송장을 따로 보관 — 사용자 결정).

POST /ocr[?rotation=0|90|180|270]   body = PDF 바이트 (rotation 없으면 자동 판정) → {"pages":[{"rotation":90,"width":..,"height":..,"items":[{"t","x","y","w","h","s"}]}]}
GET  /health
"""
import json, os, re, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import pymupdf
from rapidocr import RapidOCR

THREADS = int(os.environ.get("OCR_THREADS", "2"))
DPI = int(os.environ.get("OCR_DPI", "200"))
MAX_PAGES = int(os.environ.get("OCR_MAX_PAGES", "20"))
MAX_BYTES = 30 * 1024 * 1024

# 글자별 방향 보정(cls)은 끈다 — 켜 두면 페이지가 거꾸로(180°) 서 있어도 글자는 바로 읽혀 방향 판정이 속는다.
# 그러면 표가 뒤집힌 채라 맨 아래 줄부터 나온다(실무 피드백 '역순으로 읽힘', 2026-10-03 재현).
# 끄면 거꾸로 선 페이지에선 글자가 안 읽히므로, 판번호·규격이 읽히는 방향이 곧 바른 방향이다.
engine = RapidOCR(params={"EngineConfig.onnxruntime.intra_op_num_threads": THREADS, "Global.use_cls": False})
lock = threading.Lock()

# 방향 판정용 — 판번호(B62839101 · PC47594901 · PP79353504 …)와 규격(12x1501x7700)
HEAT = re.compile(r"[A-Z]{1,2}\d{7,8}")
SPEC = re.compile(r"\d+(?:\.\d)?[xX*×]\d{3,4}[xX*×]\d{3,5}")


def read_page(img):
    res = engine(img, use_det=True, use_rec=True)   # 옵션을 명시 — use_rec=False 호출(is_sideways) 설정이 다음 호출에 남는다
    items = []
    for t, b, sc in zip(res.txts or [], res.boxes if res.boxes is not None else [], res.scores or []):
        xs = [p[0] for p in b]; ys = [p[1] for p in b]
        items.append({"t": t, "x": round(float(np.mean(xs)), 1), "y": round(float(np.mean(ys)), 1),
                      "w": round(float(max(xs) - min(xs)), 1), "h": round(float(max(ys) - min(ys)), 1), "s": round(float(sc), 3)})
    return items


def quality(items):
    """방향 판정 점수 — 가로로 누운 상자 중 판번호·규격 모양인 것들의 (개수, 평균 신뢰도).
    샘플 실측: 바른 방향 평균 0.98~0.99, 거꾸로(180°) 0.67~0.69 — 거꾸로 선 숫자도 숫자처럼 읽혀 개수만으론 못 가른다."""
    m = [it["s"] for it in items if it["w"] > it["h"] * 1.5 and
         (HEAT.search(it["t"].replace(" ", "").upper()) or SPEC.search(it["t"].replace(" ", "")))]
    return len(m), (sum(m) / len(m) if m else 0.0)


def is_sideways(img):
    """글자 위치만 찾아(읽지 않음 — 빠름) 줄이 세로로 서 있으면 True. 스캔이 옆으로 누운 경우."""
    res = engine(img, use_rec=False)
    boxes = res.boxes if res.boxes is not None else []
    wide = tall = 0
    for b in boxes:
        w = max(p[0] for p in b) - min(p[0] for p in b); h = max(p[1] for p in b) - min(p[1] for p in b)
        if w > h * 1.5: wide += 1
        elif h > w * 1.5: tall += 1
    return tall > wide


def ocr_pdf(data: bytes, fixed_k=None):
    """페이지 방향: ① 줄의 축(가로/세로)을 위치만 보고 정하고 ② 그 축의 두 방향 중 하나를 읽어 신뢰도가 높으면 채택,
    아니면 반대(180°)도 읽어 더 나은 쪽. 한 묶음은 보통 같은 방향이라 앞 장에서 맞은 쪽을 먼저 읽는다."""
    doc = pymupdf.open(stream=data, filetype="pdf")
    pages = []
    prefer = {False: 0, True: 1}   # 축별로 먼저 읽을 방향(k: np.rot90 횟수)
    for pno in range(min(len(doc), MAX_PAGES)):
        pix = doc[pno].get_pixmap(dpi=DPI)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
        if fixed_k is not None:   # 사용자가 방향을 고른 경우 — 판정 없이 그 방향으로만
            rot = np.ascontiguousarray(np.rot90(img, fixed_k))
            pages.append({"rotation": fixed_k * 90, "width": rot.shape[1], "height": rot.shape[0], "items": read_page(rot)})
            continue
        side = is_sideways(img)
        first = prefer[side]
        cands = []
        for k in (first, (first + 2) % 4):
            rot = np.ascontiguousarray(np.rot90(img, k))
            items = read_page(rot)
            n, conf = quality(items)
            cands.append((n * conf, n, conf, k, items, rot.shape))
            if n >= 3 and conf >= 0.9:
                break
        score, n, conf, k, items, shape = max(cands, key=lambda c: c[0] * (1 if c[2] >= 0.9 else 0.5))
        prefer[side] = k
        pages.append({"rotation": k * 90, "width": shape[1], "height": shape[0], "items": items})
    return pages


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True, "threads": THREADS})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path, _, qs = self.path.partition("?")
        if path != "/ocr":
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BYTES:
            return self._send(400, {"error": "PDF 크기가 올바르지 않습니다."})
        data = self.rfile.read(n)
        m = re.search(r"rotation=(0|90|180|270)", qs)
        fixed_k = int(m.group(1)) // 90 if m else None
        t0 = time.time()
        try:
            with lock:   # 한 번에 하나 — 저사양 NAS 메모리 보호
                pages = ocr_pdf(data, fixed_k)
        except Exception as e:   # 깨진 PDF 등
            return self._send(400, {"error": f"PDF 를 읽을 수 없습니다: {e}"})
        self._send(200, {"pages": pages, "seconds": round(time.time() - t0, 1)})

    def log_message(self, fmt, *args):
        print("[ocr]", self.address_string(), fmt % args, flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"[ocr] listening :{port} threads={THREADS} dpi={DPI}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
