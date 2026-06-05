@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ============================================================
echo  PDF -> Excel 변환 도구
echo ============================================================
echo.

REM PDF 인자 확인
if "%~1"=="" (
    echo 사용법:
    echo   PDF 파일을 이 bat 파일 위로 드래그앤드롭 하세요.
    echo   또는 명령창에서: run.bat "C:\path\to\file.pdf"
    echo.
    echo 처음 사용 시 install.bat 을 먼저 실행하세요.
    echo.
    pause
    exit /b 1
)

REM Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 이 설치되지 않았습니다.
    echo install.bat 을 먼저 실행하세요.
    pause
    exit /b 1
)

REM 실행
python extract.py "%~1"

echo.
echo ============================================================
pause
