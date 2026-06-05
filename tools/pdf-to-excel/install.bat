@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ============================================================
echo  PDF -> Excel 변환 도구  의존성 설치
echo ============================================================
echo.

REM Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 이 설치되지 않았습니다.
    echo.
    echo Python 3.9 이상을 설치해주세요:
    echo   https://www.python.org/downloads/
    echo.
    echo 설치 시 "Add Python to PATH" 체크박스를 반드시 선택하세요.
    echo.
    pause
    exit /b 1
)

echo [확인] Python 설치 OK
python --version
echo.

echo [1/2] pip 업그레이드 중...
python -m pip install --upgrade pip
echo.

echo [2/2] 패키지 설치 중 (수 분 소요 — 처음 1회만)...
echo.
pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] 패키지 설치 실패.
    echo.
    echo 일부 패키지 (특히 paddlepaddle) 가 Windows 에서 설치 실패하는 경우:
    echo   1) 가상환경 사용 권장: python -m venv venv ^&^& venv\Scripts\activate
    echo   2) 또는 paddlepaddle 대신 paddlepaddle-gpu 시도 (GPU 있을 때)
    echo   3) 또는 다른 OCR 엔진 사용: pip install easyocr  (코드 수정 필요)
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  설치 완료
echo ============================================================
echo.
echo 사용 방법:
echo   1) PDF 파일을 run.bat 위로 드래그앤드롭
echo   또는
echo   2) 명령 프롬프트에서: run.bat "C:\path\to\file.pdf"
echo.
echo 처음 실행 시 PaddleOCR 모델 다운로드 (~500MB) 자동 진행됩니다.
echo.
pause
