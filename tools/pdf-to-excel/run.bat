@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title PDF Extractor - Run
cd /d "%~dp0"

if "%~1"=="" (
    echo ============================================================
    echo  PDF Extractor
    echo ============================================================
    echo.
    echo Usage:
    echo   1. Drag and drop a PDF file onto run.bat
    echo   2. Or run from cmd: run.bat "C:\path\to\file.pdf"
    echo.
    echo If you haven't installed dependencies yet, run install.bat first.
    echo See README.md for details.
    echo.
    pause
    exit /b 0
)

REM Save PDF path/name as variables BEFORE any if-block expansion
REM (필수: 파일명에 괄호 포함 시 if 블록 파싱 깨짐 방지)
set "PDF_PATH=%~1"
set "PDF_NAME=%~nx1"

REM --- Check venv ---
if not exist "venv\Scripts\python.exe" (
    echo ============================================================
    echo [ERROR] Python venv not found
    echo ============================================================
    echo.
    echo Run install.bat first to set up Python 3.11 + PaddleOCR.
    echo.
    pause
    exit /b 1
)

REM --- Check input file ---
if not exist "!PDF_PATH!" (
    echo [ERROR] File not found.
    echo.
    pause
    exit /b 1
)

echo [INFO] Input PDF selected
echo [INFO] Python: .\venv\Scripts\python.exe
echo.

"venv\Scripts\python.exe" "%~dp0extract.py" "!PDF_PATH!"
set EXITCODE=!errorlevel!

echo.
if !EXITCODE! neq 0 (
    echo ============================================================
    echo [ERROR] Extraction failed.
    echo ============================================================
) else (
    echo ============================================================
    echo [OK] Done. Excel file saved next to the PDF.
    echo ============================================================
)
pause
exit /b !EXITCODE!
