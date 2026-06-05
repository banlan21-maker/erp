# 절단도면 PDF → 엑셀 변환 도구

ERP 의 [엑셀] 업로드 기능과 호환되는 엑셀을 PC 에서 자동 생성합니다.

## 작동 방식

```
PDF 파일
   ↓
[1] PyMuPDF (PDF → 텍스트 또는 이미지)
   ↓
[2] OCR (RapidOCR-ONNX 기본, pytesseract fallback)
   ↓
[3] 라벨 매칭 (ERP 와 동일 알고리즘)
   ↓
output.xlsx  ← ERP 의 [엑셀] 버튼으로 업로드
```

### OCR 엔진 선택

| 엔진 | Python 3.14 호환 | 정확도 | 설치 부담 | 비고 |
|---|---|---|---|---|
| **RapidOCR-ONNX** (기본) | ✓ (onnxruntime 1.26+) | 96~98% | pip 한 줄 | PaddleOCR 모델 → ONNX 변환, PaddlePaddle 불필요 |
| **pytesseract** (fallback) | ✓ | 90~95% | Tesseract 바이너리 별도 설치 | 안정적, 한글 지원 |
| ~~PaddleOCR~~ | ✗ (PaddlePaddle 미지원) | 96~98% | — | Python 3.13 까지만 |

## 첫 사용 (1회만)

1. **Python 3.9 이상 설치** — https://www.python.org/downloads/
   - 설치 시 "Add Python to PATH" 체크박스 반드시 선택

2. **install.bat 더블클릭** — 의존성 자동 설치
   - PyMuPDF / PaddleOCR / openpyxl 등 자동 설치
   - 수 분 소요 (네트워크 속도에 따라)

## 사용

방법 1 (가장 편함): **PDF 파일을 `run.bat` 위로 드래그앤드롭**

방법 2: 명령창에서
```
run.bat "C:\path\to\file.pdf"
```

## 출력

- 같은 폴더에 `<PDF이름>_output.xlsx` 생성
- 컬럼: 페이지 / 도면번호 / 부재중량(Kg) / 마킹길이(M) / 절단길이(M)

## ERP 에 업로드

1. ERP → 절단도면 PDF 탭 → 해당 호선/블록 선택
2. 업로드된 PDF 행의 **[엑셀] 청록색 버튼** 클릭
3. 위에서 생성된 `_output.xlsx` 선택
4. 미리보기 확인 → [업로드 N행]

같은 (PDF, 페이지) 의 기존 데이터는 덮어쓰기됩니다.

## 지원 양식 (자동 감지)

| 양식 | 인식 키워드 | 도면번호 추출 |
|---|---|---|
| 1. 한국조선기술 NESTING (텍스트 PDF) | `사용중량(Kg)` | 끝 5자리 (예: NCP01) |
| 2. NC 가공도 TOTAL PART WEIGHT | `TOTAL PART WEIGHT` | 끝 5자리 (예: CNX01) |
| 3. NC 가공도 PART WEIGHT | `PART WEIGHT` (TOTAL 없음) | 끝 6자리 (예: CNK001) |

새 양식 필요 시 `extract.py` 의 `PRESETS` 리스트에 추가.

## 정확도 한계 + 검토

- OCR 정확도: 영문 96~98% (PaddleOCR v2.7+)
- 페이지당 1~3개 글자 오인식 가능 (특히 `0↔O`, `1↔I`, `5↔S`)
- **반드시 엑셀을 열어서 결과 검토 후 업로드** — 잘못된 값은 엑셀에서 직접 수정
- 그 다음 ERP 에 업로드하면 100% 정확

## 문제 해결

### Python 이 설치 안 됐다고 뜸
- python.org 에서 3.9 이상 설치
- 설치 시 "Add Python to PATH" 체크

### RapidOCR 설치 실패 (onnxruntime wheel 없음)

Python 버전 확인:
```
python --version
```
- Python 3.10 ~ 3.14: 정상 동작 예상
- Python 3.15+ : onnxruntime wheel 대기 필요

대안 — **pytesseract + Tesseract 바이너리** (Python 무관):

1. **Tesseract 설치**: https://github.com/UB-Mannheim/tesseract/wiki 에서 installer 다운로드
   - 설치 중 "Korean" 언어 데이터 체크
   - "Add to PATH" 옵션 체크
2. **Python 패키지**:
   ```
   pip install pytesseract pymupdf openpyxl pillow
   ```
3. `extract.py` 가 자동으로 rapidocr → pytesseract fallback (코드 수정 불필요)

### 더 정확한 결과 원함 — 대안 OCR 엔진

**옵션 A: PaddleOCR (Python 3.13 이하 필요, 정확도 최고)**
```
py -3.11 -m venv venv
venv\Scripts\activate
pip install paddlepaddle paddleocr pymupdf openpyxl pillow numpy
```
`extract.py` 수정 — `rapidocr_onnxruntime.RapidOCR` → `paddleocr.PaddleOCR(use_angle_cls=True, lang='en')`.

**옵션 B: MinerU (도면 표 인식 강력, 무거움)**
```
pip install -U "magic-pdf[full]"
```
별도 통합 스크립트 작성 필요.

**옵션 C: EasyOCR (PyTorch 기반)**
```
pip install easyocr
```
`extract.py` 수정 — `RapidOCR` → `easyocr.Reader(['en'])`.

### OCR 가 너무 느림
- `extract.py` 의 `scale=2.5` 를 `scale=2.0` 으로 낮추기 (정확도 약간 ↓)
- RapidOCR: GPU 사용 시 `rapidocr-paddle` 또는 `rapidocr-openvino` 변형 사용

## 파일 구조

```
pdf-to-excel/
├── README.md           ← 이 파일
├── install.bat         ← 1회 의존성 설치
├── run.bat             ← PDF 변환 실행
├── extract.py          ← 메인 스크립트
└── requirements.txt    ← Python 패키지 목록
```

## 라이센스 / 출처

ERP cnc-erp Phase B-5 동봉 도구. 내부 사용.
