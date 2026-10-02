"""
송장 OCR 서버 — ERP(app) 전용 내부 서비스 (2026-10-02)

철판 입고송장 스캔 PDF 를 받아 페이지마다 글자 상자(문자열 + 위치)를 돌려준다.
표 해석(판번호·규격 줄 맞추기)과 ERP 대조는 app 쪽(lib/invoice-ocr.ts)이 한다 — 여기는 읽기만.

- 엔진: RapidOCR (PaddleOCR PP-OCRv6 small 모델을 ONNX 로, CPU 전용). 모델은 패키지에 들어 있어 인터넷 불필요.
  한글은 못 읽지만 필요한 값(판번호·규격·재질·호선·사업자번호·날짜)은 모두 영문·숫자다.
- 스캔이 옆으로 누운 경우가 많다(샘플 4장 모두 90°) — 0°/90°/270° 중 판번호·규격이 가장 많이 잡히는 방향을 쓴다.
- NAS(펜티엄 8505 · 램 7.5GB) 기준: 한 번에 하나씩만 처리(락), 스레드 OCR_THREADS(기본 2). 최대 약 1GB.
- PDF 는 메모리에서만 쓰고 저장하지 않는다 (종이 송장을 따로 보관 — 사용자 결정).

POST /ocr   body = PDF 바이트 → {"pages":[{"rotation":90,"width":..,"height":..,"items":[{"t","x","y","w","h","s"}]}]}
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

engine = RapidOCR(params={"EngineConfig.onnxruntime.intra_op_num_threads": THREADS})
lock = threading.Lock()

# 방향 판정용 — 판번호(B62839101 · PC47594901 · PP79353504 …)와 규격(12x1501x7700)
HEAT = re.compile(r"[A-Z]{1,2}\d{7,8}")
SPEC = re.compile(r"\d+(?:\.\d)?[xX*×]\d{3,4}[xX*×]\d{3,5}")


def read_page(img):
    res = engine(img)
    items = []
    for t, b, s in zip(res.txts or [], res.boxes if res.boxes is not None else [], res.scores or []):
        xs = [p[0] for p in b]; ys = [p[1] for p in b]
        items.append({"t": t, "x": round(float(np.mean(xs)), 1), "y": round(float(np.mean(ys)), 1),
                      "w": round(float(max(xs) - min(xs)), 1), "h": round(float(max(ys) - min(ys)), 1), "s": round(float(s), 3)})
    # 가로로 누운 상자만 센다 — 방향이 틀려도 각도 보정으로 세로 글자를 읽어 내 판번호는 잡히는데,
    # 그러면 표의 '줄'이 세로로 서서 판번호↔규격 짝짓기가 깨진다(샘플: 0°에서 판번호 55 다 잡히고 규격 0).
    score = sum(1 for it in items if it["w"] > it["h"] * 1.5 and
                (HEAT.search(it["t"].replace(" ", "").upper()) or SPEC.search(it["t"].replace(" ", ""))))
    return items, score


def ocr_pdf(data: bytes):
    doc = pymupdf.open(stream=data, filetype="pdf")
    pages = []
    order = [0, 1, 3]   # 바로 → 90° → 270°
    for pno in range(min(len(doc), MAX_PAGES)):
        pix = doc[pno].get_pixmap(dpi=DPI)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
        best = None
        for k in order:   # 충분히 잡히면 거기서 멈춘다(시간 절약)
            rot = np.ascontiguousarray(np.rot90(img, k))
            items, score = read_page(rot)
            if best is None or score > best[1]:
                best = (items, score, k, rot.shape)
            if score >= 3:
                break
        items, score, k, shape = best
        # 한 묶음은 보통 같은 방향으로 스캔된다 — 맞았던 방향을 다음 장에서 먼저(샘플 4장: 47초 → 약 25초)
        order = [k] + [o for o in order if o != k]
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
        if self.path != "/ocr":
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BYTES:
            return self._send(400, {"error": "PDF 크기가 올바르지 않습니다."})
        data = self.rfile.read(n)
        t0 = time.time()
        try:
            with lock:   # 한 번에 하나 — 저사양 NAS 메모리 보호
                pages = ocr_pdf(data)
        except Exception as e:   # 깨진 PDF 등
            return self._send(400, {"error": f"PDF 를 읽을 수 없습니다: {e}"})
        self._send(200, {"pages": pages, "seconds": round(time.time() - t0, 1)})

    def log_message(self, fmt, *args):
        print("[ocr]", self.address_string(), fmt % args, flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"[ocr] listening :{port} threads={THREADS} dpi={DPI}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
