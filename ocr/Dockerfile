# 송장 OCR 서버 — ocr/server.py 참고. app 이 http://ocr:8000 으로 호출(외부 포트 없음).
FROM python:3.12-slim

# opencv 가 쓰는 시스템 라이브러리
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
# rapidocr 가 끌고 오는 opencv-python 은 화면(X11) 라이브러리를 요구한다 — 서버용(headless)으로 교체
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y opencv-python \
    && pip install --no-cache-dir opencv-python-headless==5.0.0.93
# 모델은 패키지에 들어 있다 — 빌드 때 한 번 불러 확인(실행 중 인터넷 불필요)
RUN python -c "from rapidocr import RapidOCR; RapidOCR()"

COPY server.py .
ENV PYTHONUNBUFFERED=1 OCR_THREADS=2 PORT=8000
EXPOSE 8000
CMD ["python", "server.py"]
