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

### OCR 엔진 선택 — **PaddleOCR (Python 3.11 venv) 가 기본**

| 엔진 | 정확도 | 설치 부담 | 비고 |
|---|---|---|---|
| **PaddleOCR** (기본) | **96~98%** | Python 3.11 별도 설치 + install.bat | 자동 venv 생성, 가장 정확 |
| **RapidOCR-ONNX** (대안) | 96~98% | pip install rapidocr-onnxruntime | Python 3.12-3.13 만 지원 (3.14 X) |
| **pytesseract** (fallback) | 90~95% | Tesseract 바이너리 별도 설치 | Python 무관, 가장 안정 |

`extract.py` 가 자동으로 사용 가능한 엔진을 감지 — 우선순위 paddleocr → rapidocr → pytesseract.

## 첫 사용 (1회만)

1. **Python 3.11 설치** ← **필수** (PaddleOCR 가 Python 3.13/3.14 미지원)
   - https://www.python.org/downloads/release/python-3119/
   - Files 섹션에서 "Windows installer (64-bit)" 다운로드
   - 설치 시 다음 두 가지 체크박스 반드시 선택:
     - ☑ Add python.exe to PATH
     - ☑ py launcher
   - 메인 Python (예: 3.14) 이 따로 있어도 OK — 3.11 은 venv 안에서만 쓰임

2. **install.bat 더블클릭** — 자동 진행
   - py -3.11 launcher 로 venv\ 폴더 자동 생성
   - venv 안에 PyMuPDF / PaddleOCR / PaddlePaddle / openpyxl 설치
   - 수 분 소요 (PaddlePaddle 이 ~200MB)

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

### "Python 3.11 not found via py -3.11 launcher" 뜸
- Python 3.11 별도 설치 (메인 Python 과 별개로 가능)
- https://www.python.org/downloads/release/python-3119/
- 설치 시 "py launcher" 체크박스 반드시 선택 (이게 py -3.11 명령 활성화)

### paddlepaddle 설치 실패 (Visual C++ Redistributable)
- https://aka.ms/vs/17/release/vc_redist.x64.exe 설치
- 재부팅 후 install.bat 재실행

### venv 새로 만들기
- 기존 venv\ 폴더 삭제 후 install.bat 재실행

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
